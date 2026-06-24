import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logAudit';
import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';
import {
  currentBillingMonth,
} from '@/lib/billing/linePlans';
import {
  evaluateTenantLineDeliveryUsage,
  recordDeliveryOverage,
  recordDeliveryUsage,
  safeBillingSnapshot,
} from '@/lib/billing/lineBilling';
import {
  resolveDraftRecipients,
  type LineDraftForDelivery,
} from '@/lib/line/resolveRecipients';
import {
  assertTargetCountIsSafe,
  canExecuteLineDelivery,
  canTestLineDelivery,
  enforceLineDeliveryRateLimit,
  needsTargetReconfirmation,
} from '@/lib/line/validateDelivery';
import {
  getLineChannelAccessToken,
  sendLineTextMessage,
} from '@/lib/line/sendMessage';
import { sha256Hex } from '@/lib/security/hash';

type DeliveryAction = 'test' | 'confirm' | 'send';

type SendRequestBody = {
  draftId?: string;
  action?: DeliveryAction;
  testLineUserId?: string;
};

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type LineMessageDraftRow = LineDraftForDelivery & {
  deal_id: string | null;
  vehicle_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  message_type: string | null;
  status: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivery_confirmed_at: string | null;
  delivery_confirmed_by: string | null;
  target_count_snapshot: number | null;
  target_condition_snapshot: unknown;
  message_snapshot: unknown;
};

type LineMessageLogInsert = {
  store_id: string;
  draft_id: string | null;
  deal_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  line_user_id: string | null;
  line_user_hash: string | null;
  line_display_name: string | null;
  message_type: string | null;
  title: string | null;
  body: string;
  body_hash: string | null;
  body_length: number | null;
  body_redacted_at: string | null;
  send_status: string;
  line_response: unknown;
  error_message: string | null;
  sent_at: string | null;
  created_by: string | null;
};

function errorResponse(message: string, status = 400, code = 'line_send_error') {
  // 5xxは原因追跡のためサーバーログに残す（本文・宛先・Secretは出さない）。
  if (status >= 500) {
    console.error('[garage-link:error]', JSON.stringify({ service: 'garage-link', code, route: '/api/line/send', status }));
  }
  return Response.json({ ok: false, error: message, code }, { status });
}

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

function userAgent(request: Request) {
  return request.headers.get('user-agent');
}

function safeLineResponse(value: unknown) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const response = value as Record<string, unknown>;
  return {
    status: response.status ?? null,
    message: typeof response.message === 'string' ? response.message : null,
  };
}

async function createSendLog({
  supabase,
  draft,
  sendStatus,
  lineResponse,
  errorMessage,
  sentAt,
  createdBy,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  draft: LineMessageDraftRow;
  sendStatus: 'sent' | 'failed';
  lineResponse: unknown;
  errorMessage: string | null;
  sentAt: string | null;
  createdBy: string | null;
}) {
  const bodyText = draft.body?.trim() ?? '';
  const payload: LineMessageLogInsert = {
    store_id: draft.store_id,
    draft_id: draft.id,
    deal_id: draft.deal_id,
    customer_id: draft.customer_id,
    vehicle_id: draft.vehicle_id,
    quote_id: draft.quote_id,
    invoice_id: draft.invoice_id,
    line_user_id: null,
    line_user_hash: draft.line_user_id ? sha256Hex(draft.line_user_id) : null,
    line_display_name: null,
    message_type: draft.message_type,
    title: draft.title,
    body: '',
    body_hash: bodyText ? sha256Hex(bodyText) : null,
    body_length: bodyText.length,
    body_redacted_at: new Date().toISOString(),
    send_status: sendStatus,
    line_response: safeLineResponse(lineResponse),
    error_message: errorMessage,
    sent_at: sentAt,
    created_by: createdBy,
  };

  await supabase.from<LineMessageLogInsert>('line_message_logs').insert(payload);
}

async function getLineFeatureEnabled({
  supabase,
  tenantId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string | null;
}) {
  if (!tenantId) {
    return true;
  }

  const { data } = await supabase
    .from<{ enabled: boolean | null }>('tenant_features')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('feature_code', 'line')
    .eq('enabled', true)
    .single();

  return Boolean(data?.enabled);
}

async function logDeliverySecurityEvent({
  supabase,
  tenantId,
  userId,
  eventType,
  severity = 'high',
  request,
  details,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string | null;
  userId: string;
  eventType:
    | 'role_access_denied'
    | 'feature_access_denied'
    | 'tenant_access_denied'
    | 'cross_tenant_delivery_blocked'
    | 'delivery_target_mismatch'
    | 'delivery_plan_limit_exceeded'
    | 'line_token_decrypt_failed'
    | 'line_token_missing';
  severity?: 'medium' | 'high' | 'critical';
  request: Request;
  details?: Record<string, unknown>;
}) {
  await logSecurityEvent({
    supabase,
    tenantId,
    userId,
    eventType,
    severity,
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
    details,
  });
}

export async function POST(request: Request) {
  let requestBody: SendRequestBody;

  try {
    requestBody = (await request.json()) as SendRequestBody;
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!requestBody.draftId) {
    return errorResponse('draftId is required');
  }

  const action = requestBody.action ?? 'send';
  if (action !== 'test' && action !== 'confirm' && action !== 'send') {
    return errorResponse('actionが正しくありません。');
  }
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return errorResponse('ログイン情報を取得できませんでした。', 401);
  }

  const { data: draft, error: draftError } = await supabase
    .from<LineMessageDraftRow>('line_message_drafts')
    .select('id, tenant_id, store_id, deal_id, customer_id, vehicle_id, quote_id, invoice_id, message_type, title, body, status, line_user_id, line_display_name, scheduled_at, sent_at, delivery_confirmed_at, delivery_confirmed_by, target_count_snapshot, target_condition_snapshot, message_snapshot')
    .eq('id', requestBody.draftId)
    .single();

  if (draftError || !draft) {
    return errorResponse(draftError?.message ?? 'LINE下書きが見つかりません。', 404);
  }

  const currentDraft = draft;

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role, display_name, email')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id || member.store_id !== currentDraft.store_id) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      eventType: 'tenant_access_denied',
      severity: 'critical',
      request,
      details: {
        action,
        draft_id: currentDraft.id,
      },
    });
    return errorResponse('このLINE下書きを操作する権限がありません。', 403);
  }

  const currentMember = member;
  const ipAddress = clientIp(request);

  try {
    await enforceLineDeliveryRateLimit({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      ipAddress,
      action,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : '配信操作が制限されました。', 429);
  }

  const lineFeatureEnabled = await getLineFeatureEnabled({
    supabase,
    tenantId: currentDraft.tenant_id,
  });

  if (!lineFeatureEnabled) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      eventType: 'feature_access_denied',
      request,
      details: {
        action,
        feature: 'line',
      },
    });
    return errorResponse('LINE機能が有効化されていません。', 403);
  }

  if (action === 'test' && !canTestLineDelivery(currentMember.role)) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      eventType: 'role_access_denied',
      request,
      details: {
        action,
        role: currentMember.role,
      },
    });
    return errorResponse('権限がありません', 403);
  }

  if ((action === 'send' || action === 'confirm') && !canExecuteLineDelivery(currentMember.role)) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      eventType: 'role_access_denied',
      request,
      details: {
        action,
        role: currentMember.role,
      },
    });
    return errorResponse('配信前確認と本配信はオーナーまたは管理者のみ実行できます。', 403);
  }

  if (currentDraft.status === 'sent') {
    return errorResponse('このLINEメッセージは送信済みです。');
  }

  let resolved;

  try {
    resolved = await resolveDraftRecipients({
      supabase,
      draft: currentDraft,
    });
  } catch (error) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      eventType: 'cross_tenant_delivery_blocked',
      severity: 'critical',
      request,
      details: {
        action,
        draft_id: currentDraft.id,
        reason: error instanceof Error ? error.message : 'recipient_validation_failed',
      },
    });
    return errorResponse(error instanceof Error ? error.message : '配信対象の検証に失敗しました。', 403);
  }

  const targetCount = resolved.recipients.length;
  try {
    assertTargetCountIsSafe(targetCount);
  } catch (error) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      eventType: 'delivery_target_mismatch',
      request,
      details: {
        action,
        target_count: targetCount,
      },
    });
    return errorResponse(error instanceof Error ? error.message : '配信対象数を確認してください。');
  }

  const billingMonth = currentBillingMonth();
  const billingEvaluation = await evaluateTenantLineDeliveryUsage({
    supabase,
    tenantId: resolved.tenantId,
    deliveryCount: targetCount,
    billingMonth,
  });
  const billingSnapshot = safeBillingSnapshot(billingEvaluation);

  if ((action === 'confirm' || action === 'send') && !billingEvaluation.allowed) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: resolved.tenantId,
      userId: userData.user.id,
      eventType: 'delivery_plan_limit_exceeded',
      request,
      details: {
        action,
        plan_code: billingEvaluation.planCode,
        used_before: billingEvaluation.usedBefore,
        delivery_count: targetCount,
        monthly_delivery_limit: billingEvaluation.monthlyDeliveryLimit,
        reason_code: billingEvaluation.reasonCode,
      },
    });

    return Response.json(
      {
        ok: false,
        error: billingEvaluation.message ?? '契約プランの配信数上限を超過しています。',
        billing: billingSnapshot,
      },
      { status: 402 }
    );
  }

  if (action === 'confirm') {
    const confirmedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('line_message_drafts')
      .update({
        tenant_id: resolved.tenantId,
        delivery_confirmed_at: confirmedAt,
        delivery_confirmed_by: userData.user.id,
        target_count_snapshot: targetCount,
        target_condition_snapshot: resolved.targetConditionSnapshot,
        message_snapshot: resolved.messageSnapshot,
      })
      .eq('id', currentDraft.id);

    if (updateError) {
      return errorResponse('配信前確認の保存に失敗しました。');
    }

    await logAudit({
      supabase,
      storeId: currentDraft.store_id,
      userId: userData.user.id,
      userEmail: userData.user.email ?? currentMember.email,
      userRole: currentMember.role,
      userDisplayName: currentMember.display_name,
      action: 'delivery_confirmed',
      targetType: 'line_message',
      targetId: currentDraft.id,
      targetLabel: currentDraft.title,
      metadata: {
        target_count: targetCount,
        confirmed_at: confirmedAt,
        delivery_type: 'single_draft',
        billing: billingSnapshot,
      },
    });

    return Response.json({
      ok: true,
      action,
      targetCount,
      confirmedAt,
      targetCondition: resolved.targetConditionSnapshot,
      billing: billingSnapshot,
      message: '配信前確認を保存しました。',
    });
  }

  if (action === 'send') {
    if (!currentDraft.delivery_confirmed_at) {
      return errorResponse('本配信前に配信前確認を実行してください。', 409);
    }

    if (needsTargetReconfirmation(currentDraft.target_count_snapshot, targetCount)) {
      await logDeliverySecurityEvent({
        supabase,
        tenantId: currentDraft.tenant_id,
        userId: userData.user.id,
        eventType: 'delivery_target_mismatch',
        request,
        details: {
          action,
          snapshot_count: currentDraft.target_count_snapshot,
          current_count: targetCount,
        },
      });
      return errorResponse('配信対象数が確認時から変わっています。再度、配信前確認を実行してください。', 409);
    }
  }

  const tokenResult = await getLineChannelAccessToken(currentDraft.store_id);

  if (!tokenResult.token) {
    await logDeliverySecurityEvent({
      supabase,
      tenantId: currentDraft.tenant_id,
      userId: userData.user.id,
      eventType: tokenResult.errorType === 'decrypt_failed' ? 'line_token_decrypt_failed' : 'line_token_missing',
      severity: tokenResult.errorType === 'decrypt_failed' ? 'critical' : 'high',
      request,
      details: {
        action,
        draft_id: currentDraft.id,
      },
    });
    return errorResponse(tokenResult.message ?? 'LINE Channel Access Token が未設定です。');
  }

  const recipient = action === 'test'
    ? {
        lineUserId: requestBody.testLineUserId?.trim() || resolved.recipients[0].lineUserId,
        lineDisplayName: requestBody.testLineUserId?.trim() ? 'テスト宛先' : resolved.recipients[0].lineDisplayName,
      }
    : resolved.recipients[0];

  let lineResponse: unknown = null;
  const sentAt = new Date().toISOString();

  try {
    const response = await sendLineTextMessage({
      channelAccessToken: tokenResult.token,
      to: recipient.lineUserId,
      text: currentDraft.body?.trim() ?? '',
    });
    lineResponse = response.lineResponse;

    if (!response.ok) {
      throw new Error('LINE Messaging APIで送信に失敗しました。');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'LINE Messaging APIで送信に失敗しました。';

    if (action === 'test') {
      await supabase.from('line_test_delivery_logs').insert({
        tenant_id: resolved.tenantId,
        store_id: currentDraft.store_id,
        message_id: currentDraft.id,
        test_recipient: 'masked',
        message_hash: resolved.messageSnapshot.body_hash,
        message_body_length: resolved.messageSnapshot.body_length,
        sent_by: userData.user.id,
        sent_at: null,
        status: 'failed',
        error_message: errorMessage,
      });
    } else {
      await createSendLog({
        supabase,
        draft: currentDraft,
        sendStatus: 'failed',
        lineResponse,
        errorMessage,
        sentAt: null,
        createdBy: userData.user.id,
      });
      await supabase.from('line_delivery_logs').insert({
        tenant_id: resolved.tenantId,
        store_id: currentDraft.store_id,
        message_id: currentDraft.id,
        delivery_type: 'single',
        status: 'failed',
        target_count: targetCount,
        sent_count: 0,
        failed_count: targetCount,
        skipped_count: 0,
        target_condition_snapshot: resolved.targetConditionSnapshot,
        message_snapshot: resolved.messageSnapshot,
        message_hash: resolved.messageSnapshot.body_hash,
        message_body_length: resolved.messageSnapshot.body_length,
        confirmed_at: currentDraft.delivery_confirmed_at,
        confirmed_by: currentDraft.delivery_confirmed_by,
        sent_at: null,
        sent_by: userData.user.id,
        created_by: userData.user.id,
      });
    }

    await logAudit({
      supabase,
      storeId: currentDraft.store_id,
      userId: userData.user.id,
      userEmail: userData.user.email ?? currentMember.email,
      userRole: currentMember.role,
      userDisplayName: currentMember.display_name,
      action: action === 'test' ? 'test_delivery_sent' : 'delivery_failed',
      targetType: 'line_message',
      targetId: currentDraft.id,
      targetLabel: currentDraft.title,
      metadata: {
        status: 'failed',
        target_count: targetCount,
        delivery_type: action,
      },
    });

    return errorResponse(errorMessage, 502);
  }

  if (action === 'test') {
    await supabase.from('line_test_delivery_logs').insert({
      tenant_id: resolved.tenantId,
      store_id: currentDraft.store_id,
      message_id: currentDraft.id,
      test_recipient: 'masked',
      message_hash: resolved.messageSnapshot.body_hash,
      message_body_length: resolved.messageSnapshot.body_length,
      sent_by: userData.user.id,
      sent_at: sentAt,
      status: 'sent',
      error_message: null,
    });
    await supabase
      .from('line_message_drafts')
      .update({ test_sent_at: sentAt, test_sent_by: userData.user.id })
      .eq('id', currentDraft.id);
    await logAudit({
      supabase,
      storeId: currentDraft.store_id,
      userId: userData.user.id,
      userEmail: userData.user.email ?? currentMember.email,
      userRole: currentMember.role,
      userDisplayName: currentMember.display_name,
      action: 'test_delivery_sent',
      targetType: 'line_message',
      targetId: currentDraft.id,
      targetLabel: currentDraft.title,
      metadata: {
        status: 'sent',
        target_count: 1,
        delivery_type: 'test',
      },
    });

    return Response.json({ ok: true, action, message: 'テスト配信を送信しました。' });
  }

  const { error: updateError } = await supabase
    .from('line_message_drafts')
    .update({ status: 'sent', sent_at: sentAt, last_delivery_attempt_at: sentAt })
    .eq('id', currentDraft.id);

  if (updateError) {
    return errorResponse('送信後のステータス更新に失敗しました。');
  }

  await createSendLog({
    supabase,
    draft: currentDraft,
    sendStatus: 'sent',
    lineResponse,
    errorMessage: null,
    sentAt,
    createdBy: userData.user.id,
  });

  await supabase.from('line_delivery_logs').insert({
    tenant_id: resolved.tenantId,
    store_id: currentDraft.store_id,
    message_id: currentDraft.id,
    delivery_type: 'single',
    status: 'sent',
    target_count: targetCount,
    sent_count: 1,
    failed_count: 0,
    skipped_count: 0,
    target_condition_snapshot: resolved.targetConditionSnapshot,
    message_snapshot: resolved.messageSnapshot,
    message_hash: resolved.messageSnapshot.body_hash,
    message_body_length: resolved.messageSnapshot.body_length,
    confirmed_at: currentDraft.delivery_confirmed_at,
    confirmed_by: currentDraft.delivery_confirmed_by,
    sent_at: sentAt,
    sent_by: userData.user.id,
    created_by: userData.user.id,
  });

  await recordDeliveryUsage({
    supabase,
    tenantId: resolved.tenantId,
    storeId: currentDraft.store_id,
    messageId: currentDraft.id,
    deliveryCount: targetCount,
    billingMonth,
  });

  await recordDeliveryOverage({
    supabase,
    tenantId: resolved.tenantId,
    storeId: currentDraft.store_id,
    evaluation: billingEvaluation,
    billingMonth,
  });

  await logAudit({
    supabase,
    storeId: currentDraft.store_id,
    userId: userData.user.id,
    userEmail: userData.user.email ?? currentMember.email,
    userRole: currentMember.role,
    userDisplayName: currentMember.display_name,
    action: 'delivery_sent',
    targetType: 'line_message',
    targetId: currentDraft.id,
    targetLabel: currentDraft.title,
    metadata: {
      status: 'sent',
      target_count: targetCount,
      delivery_type: 'single',
      sent_at: sentAt,
      billing: billingSnapshot,
    },
  });

  return Response.json({ ok: true, action, billing: billingSnapshot, message: 'LINEメッセージを送信しました。' });
}
