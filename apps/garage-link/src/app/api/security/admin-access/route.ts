import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ADMIN_ACCESS_COOKIE,
  adminAccessCookieValue,
  createAdminAccessSalt,
  hashAdminAccessCode,
  verifyAdminAccessCode,
} from '@/lib/security/adminAccess';

type CredentialRow = {
  user_id: string;
  salt: string;
  code_hash: string;
  failed_attempts: number;
  locked_until: string | null;
};

async function getAdminContext() {
  const userClient = await createClient();
  const { data } = await userClient.auth.getClaims();
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  if (!userId) return { error: 'ログインが必要です。', status: 401 } as const;
  if (data?.claims?.aal !== 'aal2') return { error: '二段階認証が必要です。', status: 403 } as const;

  const service = createAdminClient();
  if (!service) return { error: 'サーバー設定が不足しています。', status: 503 } as const;

  const [membershipRole, storeRole] = await Promise.all([
    service.from('memberships').select('role').eq('user_id', userId).eq('status', 'active').limit(10),
    service.from('store_members').select('role').eq('user_id', userId).in('status', ['active', 'member']).limit(10),
  ]);
  const isAdministrator = !membershipRole.error && !storeRole.error
    && [...(membershipRole.data ?? []), ...(storeRole.data ?? [])]
      .some((membership) => ['owner', 'admin', 'implementer'].includes(membership.role ?? ''));
  if (!isAdministrator) return { error: '管理者権限が必要です。', status: 403 } as const;

  return { userId, service } as const;
}

export async function GET() {
  const context = await getAdminContext();
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data, error } = await context.service.from('admin_access_credentials').select('user_id').eq('user_id', context.userId).maybeSingle();
  if (error) return NextResponse.json({ error: '管理者アクセス設定を確認できませんでした。' }, { status: 500 });
  return NextResponse.json({ configured: Boolean(data?.user_id) });
}

export async function POST(request: Request) {
  const context = await getAdminContext();
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const cookieSecret = process.env.GARAGE_ADMIN_ACCESS_COOKIE_SECRET;
  if (!cookieSecret) return NextResponse.json({ error: '管理者アクセス制限が未設定です。' }, { status: 503 });

  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code : '';
  if (code.length < 12 || code.length > 128) return NextResponse.json({ error: 'アクセスコードは12文字以上で入力してください。' }, { status: 400 });

  const { data: credential, error: loadError } = await context.service
    .from('admin_access_credentials')
    .select('user_id, salt, code_hash, failed_attempts, locked_until')
    .eq('user_id', context.userId)
    .maybeSingle<CredentialRow>();
  if (loadError) return NextResponse.json({ error: '管理者アクセス設定を確認できませんでした。' }, { status: 500 });

  if (!credential) {
    const salt = createAdminAccessSalt();
    const codeHash = await hashAdminAccessCode(code, salt);
    const { error } = await context.service.from('admin_access_credentials').insert({
      user_id: context.userId, salt, code_hash: codeHash, failed_attempts: 0, locked_until: null,
    });
    if (error) return NextResponse.json({ error: 'アクセスコードを設定できませんでした。' }, { status: 500 });
  } else {
    if (credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()) {
      return NextResponse.json({ error: '入力回数の上限に達しました。30分後に再試行してください。' }, { status: 429 });
    }
    const valid = await verifyAdminAccessCode(code, credential.salt, credential.code_hash);
    if (!valid) {
      const { data: failure, error: failureError } = await context.service.rpc('record_admin_access_failure', { p_user_id: context.userId });
      if (failureError) return NextResponse.json({ error: '入力回数の安全確認に失敗しました。時間をおいて再試行してください。' }, { status: 503 });
      const result = Array.isArray(failure) ? failure[0] : failure;
      const lockedUntil = typeof result?.locked_until === 'string' ? result.locked_until : null;
      return NextResponse.json(
        { error: lockedUntil ? '入力回数の上限に達しました。30分後に再試行してください。' : 'アクセスコードが正しくありません。' },
        { status: lockedUntil ? 429 : 403 }
      );
    }
    const { error: clearError } = await context.service.rpc('clear_admin_access_failures', { p_user_id: context.userId });
    if (clearError) return NextResponse.json({ error: '入力回数の安全確認に失敗しました。時間をおいて再試行してください。' }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_ACCESS_COOKIE, await adminAccessCookieValue(cookieSecret, context.userId), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_ACCESS_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0,
  });
  return response;
}
