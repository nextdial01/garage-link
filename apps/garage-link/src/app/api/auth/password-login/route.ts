import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginIdentityHash } from '@/lib/security/adminAccess';

type LoginBody = {
  email?: unknown;
  password?: unknown;
  captchaToken?: unknown;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as LoginBody | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : undefined;

  if (!email || !password) {
    return NextResponse.json({ error: 'メールアドレスとパスワードを入力してください。' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.GARAGE_ADMIN_ACCESS_COOKIE_SECRET;
  const service = createAdminClient();
  if (!url || !anonKey || !secret || !service) {
    return NextResponse.json({ error: 'ログインの安全確認を利用できません。管理者に連絡してください。' }, { status: 503 });
  }

  const identityHash = await loginIdentityHash(secret, email);
  const { data: lockedUntil, error: lockError } = await service.rpc('get_login_lock', {
    p_identity_hash: identityHash,
  });
  if (lockError) {
    return NextResponse.json({ error: 'ログインの安全確認に失敗しました。時間をおいて再試行してください。' }, { status: 503 });
  }
  if (typeof lockedUntil === 'string' && new Date(lockedUntil).getTime() > Date.now()) {
    return NextResponse.json(
      { error: 'ログイン試行回数の上限に達しました。30分後に再試行してください。' },
      { status: 429 },
    );
  }

  const authCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        authCookies.splice(0, authCookies.length, ...cookiesToSet);
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });

  if (error || !data.user?.id) {
    if (error?.code && error.code !== 'invalid_credentials') {
      return NextResponse.json({ error: 'ログインを確認できませんでした。入力内容またはボット対策を確認してください。' }, { status: 401 });
    }
    const { data: failure, error: failureError } = await service.rpc('record_login_failure', {
      p_identity_hash: identityHash,
    });
    if (failureError) {
      return NextResponse.json({ error: 'ログインの安全確認に失敗しました。時間をおいて再試行してください。' }, { status: 503 });
    }
    const result = Array.isArray(failure) ? failure[0] : failure;
    const isLocked = Boolean(result?.locked_until && new Date(result.locked_until as string).getTime() > Date.now());
    return NextResponse.json(
      { error: isLocked ? 'ログイン試行回数の上限に達しました。30分後に再試行してください。' : 'メールアドレスまたはパスワードが正しくありません。' },
      { status: isLocked ? 429 : 401 },
    );
  }

  const { error: clearError } = await service.rpc('clear_login_failures', {
    p_identity_hash: identityHash,
  });
  if (clearError) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'ログインの安全確認に失敗しました。時間をおいて再試行してください。' }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  authCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });
  return response;
}
