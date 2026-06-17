import { createLLinkServiceClient, getDemoCompanyId, listLineAccountsForWebhook } from '@/lib/supabase/server';
import { decryptSecret } from '@/lib/line/encryption';
import { sha256Hex, verifyLineSignature } from '@/lib/line/security';
import { upsertLineFriend } from '@/lib/line/upsertLineFriend';

export const dynamic = 'force-dynamic';

type LineWebhookEvent = {
  type: string;
  webhookEventId?: string;
  timestamp?: number;
  source?: {
    type?: string;
    userId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
  postback?: {
    data?: string;
  };
};

type LineWebhookBody = {
  destination?: string;
  events?: LineWebhookEvent[];
};

async function getLineAccount(companyId?: string | null, destination?: string) {
  const supabase = createLLinkServiceClient();
  if (!supabase) return null;
  if (!companyId && !destination) return null;

  let query = supabase
    .from('ll_line_accounts')
    .select('id, company_id, line_bot_user_id, channel_access_token_encrypted');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  if (destination) {
    query = query.eq('line_bot_user_id', destination);
  }

  const { data } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data;
}

async function findVerifiedAccount({
  companyId,
  rawBody,
  signature,
}: {
  companyId: string | null;
  rawBody: string;
  signature: string | null;
}) {
  if (companyId) {
    const accounts = await listLineAccountsForWebhook(companyId);
    for (const account of accounts) {
      try {
        const secret = decryptSecret(account.channel_secret_encrypted);
        if (secret && verifyLineSignature({ body: rawBody, channelSecret: secret, signature })) {
          return { account, channelSecretSource: 'database' as const };
        }
      } catch {
        // Ignore invalid encrypted rows and continue to the next account.
      }
    }
  }

  const fallbackSecret = process.env.L_LINK_LINE_CHANNEL_SECRET ?? process.env.LINE_CHANNEL_SECRET;
  if (fallbackSecret && verifyLineSignature({ body: rawBody, channelSecret: fallbackSecret, signature })) {
    return { account: null, channelSecretSource: 'environment' as const };
  }

  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature');
  const supabase = createLLinkServiceClient();
  const demoCompanyId = getDemoCompanyId();

  const verified = await findVerifiedAccount({ companyId: demoCompanyId, rawBody, signature });
  if (!verified) {
    return Response.json({ ok: false, error: 'invalid_signature' }, { status: 403 });
  }

  if (!supabase) {
    return Response.json({ ok: true, skipped: 'database_not_configured' });
  }

  let payload: LineWebhookBody;
  try {
    payload = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const account = verified.account ?? (await getLineAccount(demoCompanyId ?? '', payload.destination));
  if (!account) {
    return Response.json({ ok: true, skipped: 'line_account_not_found' });
  }
  const companyId = account.company_id;

  let channelAccessToken = process.env.L_LINK_LINE_CHANNEL_ACCESS_TOKEN ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
  if ('channel_access_token_encrypted' in account) {
    try {
      const encryptedToken =
        typeof account.channel_access_token_encrypted === 'string'
          ? account.channel_access_token_encrypted
          : null;
      channelAccessToken = decryptSecret(encryptedToken) ?? channelAccessToken;
    } catch {
      channelAccessToken = null;
    }
  }
  const receivedAt = new Date().toISOString();

  for (const event of payload.events ?? []) {
    const lineUserId = event.source?.userId;
    const sourceUserHash = lineUserId ? sha256Hex(lineUserId) : null;

    const { data: webhookRow, error: webhookInsertError } = await supabase
      .from('ll_line_webhook_events')
      .insert({
        company_id: companyId,
        line_account_id: account.id,
        event_id: event.webhookEventId ?? null,
        event_type: event.type,
        source_type: event.source?.type ?? null,
        source_user_hash: sourceUserHash,
        message_type: event.message?.type ?? null,
        raw_event_hash: sha256Hex(JSON.stringify(event)),
        received_at: receivedAt,
        status: 'received',
      })
      .select('id')
      .maybeSingle();

    // 23505 = unique_violation: same webhookEventId already processed → idempotent skip
    if (webhookInsertError?.code === '23505') {
      continue;
    }

    if (lineUserId && (event.type === 'follow' || event.type === 'message' || event.type === 'unfollow' || event.type === 'postback')) {
      const friend = await upsertLineFriend({
        supabase,
        companyId,
        lineAccountId: account.id,
        lineUserId,
        channelAccessToken,
        eventType: event.type,
        messageText: event.message?.type === 'text' ? event.message.text ?? null : null,
        receivedAt,
      });

      if (webhookRow?.id) {
        await supabase.from('ll_line_webhook_events').update({ line_friend_id: friend.id }).eq('id', webhookRow.id);
      }

      if (event.type === 'message') {
        // Ignore 23505 unique_violation: duplicate webhook_event_id means already logged
        await supabase.from('ll_message_logs').insert({
          company_id: companyId,
          line_account_id: account.id,
          line_friend_id: friend.id,
          direction: 'inbound',
          message_type: event.message?.type ?? null,
          message_body: event.message?.type === 'text' ? event.message.text ?? null : null,
          message_hash: event.message?.text ? sha256Hex(event.message.text) : null,
          webhook_event_id: event.webhookEventId ?? null,
          received_at: receivedAt,
          status: 'received',
        });
      }
    }

    if (webhookRow?.id) {
      await supabase
        .from('ll_line_webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', webhookRow.id);
    }
  }

  return Response.json({ ok: true });
}
