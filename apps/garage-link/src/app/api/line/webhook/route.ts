import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { logSecurityEvent } from '@/lib/audit/logSecurityEvent';
import { verifyLineSignature } from '@/lib/line/verifySignature';
import { decryptSecret } from '@/lib/security/encryption';

type LineWebhookPayload = {
  events?: LineWebhookEvent[];
};

type LineWebhookEvent = {
  type?: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: {
    type?: string;
    userId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
  timestamp?: number;
};

type LineWebhookEventInsert = {
  tenant_id: string | null;
  store_id: string | null;
  line_user_id: string | null;
  event_id: string | null;
  event_type: string | null;
  source_type: string | null;
  source_user_hash: string | null;
  reply_token: string | null;
  message_type: string | null;
  message_text: string | null;
  raw_event_hash: string;
  raw_event: {
    webhookEventId: string | null;
    type: string | null;
    sourceType: string | null;
    messageType: string | null;
    timestamp: number | null;
    rawEventHash: string;
  };
  signature_valid: boolean;
  processed: boolean;
  status: string;
};

type LineSettingsSecretRow = {
  store_id: string;
  stores?: { tenant_id: string | null } | { tenant_id: string | null }[] | null;
  channel_secret: string | null;
  channel_secret_encrypted: string | null;
  webhook_enabled: boolean | null;
};

type VerifiedWebhookSecret = {
  storeId: string | null;
  tenantId: string | null;
  source: 'encrypted' | 'legacy_plain' | 'env';
};

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

function hashValue(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isInsecureDevWebhookAllowed() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.LINE_WEBHOOK_ALLOW_INSECURE_DEV === 'true'
  );
}

function isEnvironmentSecretFallbackDisabled() {
  return process.env.LINE_WEBHOOK_DISABLE_ENV_SECRET_FALLBACK === 'true';
}

function tenantIdFromJoinedStore(stores: LineSettingsSecretRow['stores']) {
  if (Array.isArray(stores)) {
    return stores[0]?.tenant_id ?? null;
  }

  return stores?.tenant_id ?? null;
}

function serviceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  if (!serviceRoleKey || !supabaseUrl) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function logWebhookSecurityEvent({
  eventType,
  severity,
  request,
  details,
}: {
  eventType:
    | 'webhook_signature_invalid'
    | 'webhook_secret_missing'
    | 'webhook_env_secret_fallback_used'
    | 'suspicious_request';
  severity: 'medium' | 'high' | 'critical';
  request: Request;
  details: Record<string, unknown>;
}) {
  const supabase = serviceSupabase();

  if (!supabase) {
    console.warn('Security event not saved because service role is unavailable', {
      eventType,
    });
    return;
  }

  await logSecurityEvent({
    supabase,
    eventType,
    severity,
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
    details,
  });
}

async function findVerifiedWebhookSecret({
  body,
  signature,
}: {
  body: string;
  signature: string;
}): Promise<{ configured: boolean; verified: VerifiedWebhookSecret | null }> {
  const supabase = serviceSupabase();
  let configured = false;

  if (supabase) {
    const { data, error } = await supabase
      .from('line_settings')
      .select('store_id, channel_secret, channel_secret_encrypted, webhook_enabled, stores(tenant_id)')
      .eq('webhook_enabled', true);

    if (!error) {
      for (const row of ((data ?? []) as unknown as LineSettingsSecretRow[])) {
        let secret = '';
        let source: VerifiedWebhookSecret['source'] = 'legacy_plain';

        if (row.channel_secret_encrypted) {
          configured = true;
          source = 'encrypted';
          try {
            secret = decryptSecret(row.channel_secret_encrypted);
          } catch {
            continue;
          }
        } else if (row.channel_secret) {
          configured = true;
          secret = row.channel_secret;
        }

        if (secret && verifyLineSignature({ body, channelSecret: secret, signature })) {
          return {
            configured: true,
            verified: {
              storeId: row.store_id,
              tenantId: tenantIdFromJoinedStore(row.stores),
              source,
            },
          };
        }
      }
    } else {
      console.warn('LINE webhook secret lookup failed');
    }
  }

  const environmentSecret = isEnvironmentSecretFallbackDisabled()
    ? ''
    : process.env.LINE_CHANNEL_SECRET ?? '';
  if (environmentSecret) {
    configured = true;
    if (verifyLineSignature({ body, channelSecret: environmentSecret, signature })) {
      return {
        configured: true,
        verified: {
          storeId: null,
          tenantId: null,
          source: 'env',
        },
      };
    }
  }

  return {
    configured,
    verified: null,
  };
}

export async function GET() {
  return Response.json({
    ok: true,
    message: 'LINE webhook endpoint is active',
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature') ?? '';
  const allowInsecureDev = isInsecureDevWebhookAllowed();
  const bodyHash = hashValue(body);
  const verification = allowInsecureDev
    ? { configured: true, verified: { storeId: null, tenantId: null, source: 'env' as const } }
    : await findVerifiedWebhookSecret({ body, signature });

  if (!verification.configured) {
    await logWebhookSecurityEvent({
      eventType: 'webhook_secret_missing',
      severity: 'critical',
      request,
      details: {
        body_hash: bodyHash,
        reason: 'LINE_CHANNEL_SECRET is not configured',
        environment: process.env.NODE_ENV ?? 'unknown',
      },
    });

    return Response.json(
      { ok: false, error: 'LINE webhook secret is not configured', code: 'webhook_secret_missing' },
      { status: 500 }
    );
  }

  if (!verification.verified) {
    await logWebhookSecurityEvent({
      eventType: 'webhook_signature_invalid',
      severity: 'high',
      request,
      details: {
        body_hash: bodyHash,
        signature_present: Boolean(signature),
      },
    });

    return Response.json(
      { ok: false, error: 'Invalid signature', code: 'webhook_signature_invalid' },
      { status: 403 }
    );
  }

  if (verification.verified.source === 'env') {
    await logWebhookSecurityEvent({
      eventType: 'webhook_env_secret_fallback_used',
      severity: 'medium',
      request,
      details: {
        body_hash: bodyHash,
        reason: 'LINE_CHANNEL_SECRET environment fallback was used',
      },
    });
  }

  let payload: LineWebhookPayload;

  try {
    payload = JSON.parse(body) as LineWebhookPayload;
  } catch {
    await logWebhookSecurityEvent({
      eventType: 'suspicious_request',
      severity: 'medium',
      request,
      details: {
        body_hash: bodyHash,
        reason: 'Invalid JSON body',
      },
    });

    return Response.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const rows: LineWebhookEventInsert[] = events.map((event) => {
    const eventHash = hashValue(JSON.stringify(event));
    const sourceUserHash = event.source?.userId ? hashValue(event.source.userId) : null;

    return {
      tenant_id: verification.verified?.tenantId ?? null,
      store_id: verification.verified?.storeId ?? null,
      line_user_id: null,
      event_id: event.webhookEventId ?? null,
      event_type: event.type ?? null,
      source_type: event.source?.type ?? null,
      source_user_hash: sourceUserHash,
      reply_token: event.replyToken ?? null,
      message_type: event.message?.type ?? null,
      message_text: null,
      raw_event_hash: eventHash,
      raw_event: {
        webhookEventId: event.webhookEventId ?? null,
        type: event.type ?? null,
        sourceType: event.source?.type ?? null,
        messageType: event.message?.type ?? null,
        timestamp: event.timestamp ?? null,
        rawEventHash: eventHash,
      },
      signature_valid: true,
      processed: false,
      status: 'received',
    };
  });

  const supabase = serviceSupabase();

  if (!supabase) {
    console.warn('LINE webhook received without DB save', {
      eventCount: rows.length,
      signatureValid: true,
    });
    return Response.json({ ok: true });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('line_webhook_events')
      .insert(rows);

    if (error) {
      console.warn('LINE webhook DB save failed', {
        eventCount: rows.length,
        error: error.message,
      });
    }
  }

  // TODO: event_id / rawEventHashによる冪等処理をDB制約込みで強化します。
  // TODO: 後工程でLINE userIdからtenant/line_accountを特定し、自動返信・顧客紐付けを実装します。
  return Response.json({ ok: true });
}
