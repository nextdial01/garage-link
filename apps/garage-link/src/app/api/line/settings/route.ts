import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { canManageLineSettings } from '@/lib/auth/permissions';
import { encryptSecret, getLast4, maskSecret } from '@/lib/security/encryption';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type LineSettingsRow = {
  id?: string;
  store_id: string;
  line_account_name: string | null;
  basic_id: string | null;
  channel_id: string | null;
  channel_secret: string | null;
  channel_access_token: string | null;
  channel_secret_encrypted: string | null;
  channel_access_token_encrypted: string | null;
  channel_secret_last4: string | null;
  channel_access_token_last4: string | null;
  webhook_url: string | null;
  connection_status: string | null;
  webhook_enabled: boolean | null;
  signature_verification_enabled: boolean | null;
  last_webhook_tested_at: string | null;
  default_sender_name: string | null;
  unsubscribe_message: string | null;
  friend_add_message: string | null;
  block_handling: string | null;
  default_delivery_permission: boolean | null;
  quiet_hours_enabled: boolean | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  internal_memo: string | null;
  updated_at: string | null;
};

type LineSettingsRequestBody = {
  line_account_name?: string | null;
  basic_id?: string | null;
  channel_id?: string | null;
  channel_secret?: string | null;
  channel_access_token?: string | null;
  webhook_url?: string | null;
  connection_status?: string | null;
  webhook_enabled?: boolean | null;
  signature_verification_enabled?: boolean | null;
  default_sender_name?: string | null;
  unsubscribe_message?: string | null;
  friend_add_message?: string | null;
  block_handling?: string | null;
  default_delivery_permission?: boolean | null;
  quiet_hours_enabled?: boolean | null;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  internal_memo?: string | null;
};

type ServiceSupabaseClient = NonNullable<ReturnType<typeof serviceSupabase>>;

const settingsColumns = [
  'id',
  'store_id',
  'line_account_name',
  'basic_id',
  'channel_id',
  'channel_secret',
  'channel_access_token',
  'channel_secret_encrypted',
  'channel_access_token_encrypted',
  'channel_secret_last4',
  'channel_access_token_last4',
  'webhook_url',
  'connection_status',
  'webhook_enabled',
  'signature_verification_enabled',
  'last_webhook_tested_at',
  'default_sender_name',
  'unsubscribe_message',
  'friend_add_message',
  'block_handling',
  'default_delivery_permission',
  'quiet_hours_enabled',
  'quiet_hours_start',
  'quiet_hours_end',
  'internal_memo',
  'updated_at',
].join(', ');

function serviceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  if (!serviceRoleKey || !supabaseUrl) {
    return null;
  }

  return createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toNullableText(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function normalizeBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeSettings(row: LineSettingsRow | null) {
  const secretLast4 = row?.channel_secret_last4 ?? (row?.channel_secret ? getLast4(row.channel_secret) : null);
  const tokenLast4 = row?.channel_access_token_last4 ?? (row?.channel_access_token ? getLast4(row.channel_access_token) : null);

  return {
    line_account_name: row?.line_account_name ?? '',
    basic_id: row?.basic_id ?? '',
    channel_id: row?.channel_id ?? '',
    webhook_url: row?.webhook_url ?? '',
    connection_status: row?.connection_status ?? 'not_connected',
    webhook_enabled: row?.webhook_enabled ? 'true' : 'false',
    signature_verification_enabled: row?.signature_verification_enabled === false ? 'false' : 'true',
    default_sender_name: row?.default_sender_name ?? '',
    unsubscribe_message: row?.unsubscribe_message ?? '',
    friend_add_message: row?.friend_add_message ?? '',
    block_handling: row?.block_handling ?? 'update_customer_status',
    default_delivery_permission: row?.default_delivery_permission === false ? 'false' : 'true',
    quiet_hours_enabled: row?.quiet_hours_enabled ? 'true' : 'false',
    quiet_hours_start: row?.quiet_hours_start?.slice(0, 5) ?? '',
    quiet_hours_end: row?.quiet_hours_end?.slice(0, 5) ?? '',
    internal_memo: row?.internal_memo ?? '',
    channel_secret_masked: maskSecret(secretLast4),
    channel_access_token_masked: maskSecret(tokenLast4),
    channel_secret_last4: secretLast4,
    channel_access_token_last4: tokenLast4,
    secret_encrypted: Boolean(row?.channel_secret_encrypted),
    token_encrypted: Boolean(row?.channel_access_token_encrypted),
    updated_at: row?.updated_at ?? null,
  };
}

async function getAuthorizedContext() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。' }, { status: 401 }),
    };
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。' }, { status: 403 }),
    };
  }

  if (!canManageLineSettings(member.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: '権限がありません' }, { status: 403 }),
    };
  }

  const service = serviceSupabase();
  if (!service) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: 'サーバー側のLINE設定管理が未設定です。' }, { status: 500 }),
    };
  }

  return {
    ok: true as const,
    service,
    member,
  };
}

async function getLineSettings(service: ServiceSupabaseClient, storeId: string) {
  const { data, error } = await service
    .from('line_settings')
    .select(settingsColumns)
    .eq('store_id', storeId)
    .maybeSingle();

  if (error) {
    throw new Error('LINE設定の取得に失敗しました。');
  }

  return (data as LineSettingsRow | null) ?? null;
}

export async function GET() {
  const context = await getAuthorizedContext();
  if (!context.ok) return context.response;

  try {
    const settings = await getLineSettings(context.service, context.member.store_id);
    return NextResponse.json({
      ok: true,
      role: context.member.role ?? 'viewer',
      settings: safeSettings(settings),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'LINE設定の取得に失敗しました。' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const context = await getAuthorizedContext();
  if (!context.ok) return context.response;

  let body: LineSettingsRequestBody;
  try {
    body = (await request.json()) as LineSettingsRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'リクエスト形式が正しくありません。' }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const channelSecret = toNullableText(body.channel_secret);
    const channelAccessToken = toNullableText(body.channel_access_token);
    const payload: Record<string, unknown> = {
      store_id: context.member.store_id,
      line_account_name: toNullableText(body.line_account_name),
      basic_id: toNullableText(body.basic_id),
      channel_id: toNullableText(body.channel_id),
      webhook_url: toNullableText(body.webhook_url),
      connection_status: toNullableText(body.connection_status) ?? 'not_connected',
      webhook_enabled: normalizeBoolean(body.webhook_enabled),
      signature_verification_enabled: normalizeBoolean(body.signature_verification_enabled, true),
      default_sender_name: toNullableText(body.default_sender_name),
      unsubscribe_message: toNullableText(body.unsubscribe_message),
      friend_add_message: toNullableText(body.friend_add_message),
      block_handling: toNullableText(body.block_handling) ?? 'update_customer_status',
      default_delivery_permission: normalizeBoolean(body.default_delivery_permission, true),
      quiet_hours_enabled: normalizeBoolean(body.quiet_hours_enabled),
      quiet_hours_start: toNullableText(body.quiet_hours_start),
      quiet_hours_end: toNullableText(body.quiet_hours_end),
      internal_memo: toNullableText(body.internal_memo),
    };

    if (channelSecret) {
      payload.channel_secret_encrypted = encryptSecret(channelSecret);
      payload.channel_secret_last4 = getLast4(channelSecret);
      payload.secret_encrypted_at = now;
      payload.secret_rotated_at = now;
      payload.channel_secret = null;
    }

    if (channelAccessToken) {
      payload.channel_access_token_encrypted = encryptSecret(channelAccessToken);
      payload.channel_access_token_last4 = getLast4(channelAccessToken);
      payload.token_encrypted_at = now;
      payload.token_rotated_at = now;
      payload.channel_access_token = null;
    }

    const { error } = await context.service
      .from('line_settings')
      .upsert(payload, { onConflict: 'store_id' });

    if (error) {
      throw new Error('LINE設定の保存に失敗しました。');
    }

    const settings = await getLineSettings(context.service, context.member.store_id);
    return NextResponse.json({
      ok: true,
      role: context.member.role ?? 'viewer',
      settings: safeSettings(settings),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LINE設定の保存に失敗しました。';
    const status = message.includes('APP_ENCRYPTION_KEY') ? 500 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
