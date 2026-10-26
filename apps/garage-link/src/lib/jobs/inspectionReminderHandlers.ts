import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/observability/logServerError';
import {
  type resolveStoreTenantContext,
  type GarageTenantContext,
  type GarageTenantRole,
} from '@/lib/security/garageTenantContext';
import { isAutomationDisabled } from '@/lib/security/runtimeSafety';

// 顧客フォローイベント生成ジョブ。
// - cron / バッチ実行: Authorization: Bearer ${CRON_SECRET} を付けると全店舗を処理。
// - 手動実行: ログイン中の owner/admin が自店舗のみ処理（他社データは跨がない）。
// 車検案内（generate_inspection_reminder_events）に加え、点検案内・納車後フォロー（30/90/180日）・
// 口コミ依頼・長期未接触の配信候補（generate_followup_candidate_events）も同じジョブで生成する。
// どちらも inspection_reminder_settings.enabled を店舗単位のマスタスイッチとして共有する。
// 生成は冪等（同一条件は二重作成されない）。LINE送信・外部連携は行わない。
//
// TODO(L-LINK連携): 将来 L-LINK へ配信候補/下書き作成要求を送る際は、送信直前に
// イベントの inspection_expiry_date と対象車両の現在の inspection_expiry_date を再照合し、
// 不一致（満了日が訂正された旧満了日向けの pending 等）は送信せず status='skipped' にする。
// 今回は実通信を実装せず、既存 pending の自動 skip も行わない（設計メモのみ）。
// Dynamic route policy remains on the normal route wrapper.

type StoreMemberRow = { tenant_id: string; store_id: string; role: string | null };
type StoreScopeRow = { id: string; tenant_id: string };
type JobBreakdown = { inspection_reminder: number; followup_candidates: number };

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type InspectionJobServiceFactory = () => ReturnType<typeof serviceSupabase>;

function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を付与できる。
  return header === `Bearer ${secret}`;
}

// This project's service role intentionally cannot SELECT stores. Resolve only
// the requested store through the existing scoped service RPC; never widen ACLs.
async function resolveGenerationStoreContext(
  service: NonNullable<ReturnType<typeof serviceSupabase>>,
  input: Parameters<typeof resolveStoreTenantContext>[1],
): Promise<GarageTenantContext> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.storeId) || !uuid.test(input.expectedTenantId) || !input.correlationId.trim()
    || (input.source === 'api' && (!input.actorUserId || !input.actorRole))) throw new Error('INVALID_CONTEXT');
  const { data, error } = await service.rpc('service_resolve_garage_store_scope', { p_store_id: input.storeId });
  if (error || !Array.isArray(data) || data.length !== 1) throw new Error('STORE_SCOPE_UNAVAILABLE');
  const scope = data[0] as { store_id?: string; tenant_id?: string; store_status?: string } | null;
  if (!scope || scope.store_id !== input.storeId || scope.tenant_id !== input.expectedTenantId || scope.store_status !== 'active') throw new Error('STORE_SCOPE_MISMATCH');
  return Object.freeze({
    tenantId: input.expectedTenantId, storeId: input.storeId,
    actorUserId: input.actorUserId, actorRole: input.actorRole,
    source: input.source, correlationId: input.correlationId,
  });
}

// 両方の生成RPCを実行し、件数の内訳を返す。片方が失敗しても他方の結果は失わない
// （それぞれ独立したトランザクションのため、部分成功を握り潰さず呼び出し元へ伝える）。
async function runGenerationJobs(
  service: NonNullable<ReturnType<typeof serviceSupabase>>,
  context: GarageTenantContext
): Promise<{ breakdown: JobBreakdown; errors: string[] }> {
  if (!context.storeId) throw new Error('STORE_CONTEXT_REQUIRED');
  // The database authorization wrappers default to UTC CURRENT_DATE. Bind both
  // calls to one server-calculated JST date, including 00:00–08:59 in Japan.
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const todayJst = ['year', 'month', 'day'].map((type) => dateParts.find((part) => part.type === type)!.value).join('-');
  const errors: string[] = [];
  const breakdown: JobBreakdown = { inspection_reminder: 0, followup_candidates: 0 };

  const { data: inspectionData, error: inspectionError } = await service.rpc(
    'generate_inspection_reminder_events',
    { p_store_id: context.storeId, p_today: todayJst }
  );
  if (inspectionError) {
    errors.push(inspectionError.message);
  } else {
    breakdown.inspection_reminder = inspectionData ?? 0;
  }

  const { data: followupData, error: followupError } = await service.rpc(
    'generate_followup_candidate_events',
    { p_store_id: context.storeId, p_today: todayJst }
  );
  if (followupError) {
    errors.push(followupError.message);
  } else {
    breakdown.followup_candidates = followupData ?? 0;
  }

  return { breakdown, errors };
}

// Vercel Cron は GET で叩く（CRON_SECRET設定時は Authorization: Bearer を自動付与）。全店舗を処理。
export async function runInspectionJobGET(request: Request, serviceFactory: InspectionJobServiceFactory = serviceSupabase, controlledEnumerationFailure = false) {
  // A QA-only probe never enables automation: its service cannot enumerate or generate.
  if (isAutomationDisabled() && !controlledEnumerationFailure) {
    return NextResponse.json({ ok: false, error: '自動処理は停止中です。', code: 'automation_disabled' }, { status: 503 });
  }
  let controlledCalls = 0;
  const service = controlledEnumerationFailure
    ? ({ rpc: async (name: string) => { if (name !== 'service_list_eligible_garage_stores') throw new Error('QA_UNPLANNED_RPC'); controlledCalls++; return { data: null, error: { code: 'QA_CONTROLLED', message: 'QA controlled enumeration failure' } }; } } as unknown as NonNullable<ReturnType<typeof serviceSupabase>>)
    : serviceFactory();
  if (!service) {
    return NextResponse.json({ ok: false, error: 'サーバー設定が未設定です。', code: 'config_missing' }, { status: 500 });
  }
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: '認証が必要です。', code: 'unauthorized' }, { status: 401 });
  }
  try {
    const { data: storeRows, error: storesError } = await service
      .rpc('service_list_eligible_garage_stores');
    if (storesError) throw new Error('STORE_SCOPE_ENUMERATION_FAILED');

    const breakdown: JobBreakdown = { inspection_reminder: 0, followup_candidates: 0 };
    const errors: string[] = [];
    let successfulStores = 0;
    for (const row of ((storeRows ?? []) as Array<{ store_id: string; tenant_id: string }>).map((item) => ({
      id: (item as { store_id: string }).store_id,
      tenant_id: (item as { tenant_id: string }).tenant_id,
    })) as StoreScopeRow[]) {
      try {
        const context: GarageTenantContext = await resolveGenerationStoreContext(service, {
          expectedTenantId: row.tenant_id,
          storeId: row.id,
          source: 'cron',
          correlationId: `${crypto.randomUUID()}:${row.id}`,
        });
        const result = await runGenerationJobs(service, context);
        breakdown.inspection_reminder += result.breakdown.inspection_reminder;
        breakdown.followup_candidates += result.breakdown.followup_candidates;
        errors.push(...result.errors.map(() => `store:${row.id}:generation_failed`));
        if (result.errors.length < 2) successfulStores += 1;
      } catch {
        errors.push(`store:${row.id}:scope_or_generation_failed`);
      }
    }
    if (errors.length > 0) {
      // 一部のRPCが未適用（例: 040未適用でfunction不在）でも、成功した分の生成結果は握り潰さない。
      logServerError('inspection_job_partial_failure', { route: '/api/jobs/inspection-reminders', method: 'GET', details: { scope: 'all_stores', errors } }, new Error(errors.join(' / ')));
      if (successfulStores === 0) {
        return NextResponse.json({ ok: false, error: 'ジョブ実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
      }
    }
    const created = breakdown.inspection_reminder + breakdown.followup_candidates;
    return NextResponse.json({ ok: true, scope: 'all_stores', created, breakdown, partial_errors: errors.length > 0 });
  } catch (error) {
    logServerError('inspection_job_failed', { route: '/api/jobs/inspection-reminders', method: 'GET', details: { scope: 'all_stores' } }, error);
    return NextResponse.json({ ok: false, error: 'ジョブ実行に失敗しました。', code: 'inspection_job_failed', ...(controlledCalls === 1 ? {qa_controlled_enumeration_calls: controlledCalls} : {}) }, { status: 500 });
  }
}

// 手動実行: ログイン中の owner/admin が自店舗のみ処理。
export async function runInspectionJobPOST(request: Request, serviceFactory: InspectionJobServiceFactory = serviceSupabase) {
  void request;
  const service = serviceFactory();
  if (!service) {
    return NextResponse.json({ ok: false, error: 'サーバー設定が未設定です。', code: 'config_missing' }, { status: 500 });
  }

  // ログイン中の owner/admin が自店舗のみ
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。', code: 'unauthorized' }, { status: 401 });
  }
  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('current_user_active_store_membership')
    .select('tenant_id, store_id, role')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .single();
  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。', code: 'forbidden_no_membership' }, { status: 403 });
  }
  const expectedStoreId = request.headers.get('x-garage-store-id');
  if (expectedStoreId && expectedStoreId !== member.store_id) {
    return NextResponse.json({ ok: false, error: '操作する店舗が変更されています。画面を開き直してください。', code: 'store_context_changed' }, { status: 409 });
  }
  if (member.role !== 'owner' && member.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '権限がありません。', code: 'forbidden_role' }, { status: 403 });
  }

  try {
    const context: GarageTenantContext = await resolveGenerationStoreContext(service, {
      expectedTenantId: member.tenant_id,
      storeId: member.store_id,
      actorUserId: userData.user.id,
      actorRole: member.role as GarageTenantRole,
      source: 'api',
      correlationId: request.headers.get('x-correlation-id')?.slice(0, 80) || crypto.randomUUID(),
    });
    // 自分の store_id のみを渡す（クライアント指定の店舗は受け付けない）。
    const { breakdown, errors } = await runGenerationJobs(service, context);
    if (errors.length > 0) {
      logServerError('inspection_job_partial_failure', { route: '/api/jobs/inspection-reminders', method: 'POST', storeId: member.store_id, details: { errors } }, new Error(errors.join(' / ')));
      if (breakdown.inspection_reminder === 0 && breakdown.followup_candidates === 0 && errors.length === 2) {
        return NextResponse.json({ ok: false, error: '実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
      }
    }
    const created = breakdown.inspection_reminder + breakdown.followup_candidates;
    return NextResponse.json({ ok: true, scope: 'own_store', created, breakdown, partial_errors: errors.length > 0 });
  } catch (error) {
    logServerError('inspection_job_failed', { route: '/api/jobs/inspection-reminders', method: 'POST', storeId: member.store_id }, error);
    return NextResponse.json({ ok: false, error: '実行に失敗しました。', code: 'inspection_job_failed' }, { status: 500 });
  }
}
