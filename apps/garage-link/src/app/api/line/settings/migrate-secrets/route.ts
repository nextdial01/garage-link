import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/logAudit';
import { encryptSecret, getLast4 } from '@/lib/security/encryption';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type LineSettingsSecretRow = {
  id: string;
  store_id: string;
  channel_secret: string | null;
  channel_access_token: string | null;
  channel_secret_encrypted: string | null;
  channel_access_token_encrypted: string | null;
};

type RequestBody = {
  confirm?: string;
};

const confirmationText = 'ENCRYPT_LEGACY_LINE_SECRETS';

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

function canMigrate(role: string | null) {
  return role === 'owner' || role === 'admin';
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'リクエスト形式が正しくありません。' }, { status: 400 });
  }

  if (body.confirm !== confirmationText) {
    return NextResponse.json({ ok: false, error: '確認文字列が正しくありません。' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role, display_name, email')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。' }, { status: 403 });
  }

  if (!canMigrate(member.role)) {
    return NextResponse.json({ ok: false, error: '権限がありません' }, { status: 403 });
  }

  const service = serviceSupabase();
  if (!service) {
    return NextResponse.json({ ok: false, error: 'サーバー側の移行設定が未設定です。' }, { status: 500 });
  }

  const { data: settings, error } = await service
    .from('line_settings')
    .select('id, store_id, channel_secret, channel_access_token, channel_secret_encrypted, channel_access_token_encrypted')
    .eq('store_id', member.store_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: 'LINE設定の取得に失敗しました。' }, { status: 500 });
  }

  const row = settings as LineSettingsSecretRow | null;
  if (!row) {
    return NextResponse.json({ ok: true, migrated: false, message: '移行対象のLINE設定はありません。' });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};
  let migratedSecret = false;
  let migratedToken = false;

  if (row.channel_secret) {
    if (!row.channel_secret_encrypted) {
      update.channel_secret_encrypted = encryptSecret(row.channel_secret);
      update.channel_secret_last4 = getLast4(row.channel_secret);
      update.secret_encrypted_at = now;
      update.secret_rotated_at = now;
      migratedSecret = true;
    }
    update.channel_secret = null;
  }

  if (row.channel_access_token) {
    if (!row.channel_access_token_encrypted) {
      update.channel_access_token_encrypted = encryptSecret(row.channel_access_token);
      update.channel_access_token_last4 = getLast4(row.channel_access_token);
      update.token_encrypted_at = now;
      update.token_rotated_at = now;
      migratedToken = true;
    }
    update.channel_access_token = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, migrated: false, message: '移行対象の平文Secretはありません。' });
  }

  const { error: updateError } = await service
    .from('line_settings')
    .update(update)
    .eq('store_id', member.store_id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: 'LINE Secretの移行に失敗しました。' }, { status: 500 });
  }

  await logAudit({
    supabase,
    storeId: member.store_id,
    userId: userData.user.id,
    userEmail: userData.user.email ?? member.email,
    userRole: member.role,
    userDisplayName: member.display_name,
    action: 'update',
    targetType: 'settings',
    targetId: row.id,
    targetLabel: 'LINE Secret暗号化移行',
    metadata: {
      migrated_secret: migratedSecret,
      migrated_token: migratedToken,
      plaintext_cleared: true,
    },
  });

  return NextResponse.json({
    ok: true,
    migrated: true,
    migratedSecret,
    migratedToken,
  });
}
