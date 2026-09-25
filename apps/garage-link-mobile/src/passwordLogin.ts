import { validMobileApiOrigin } from './apiOrigin';
import { supabase } from './supabase';
import { authFetch } from './authTransport';

export class MobileLoginError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MobileLoginError';
  }
}

/** Native sign-in uses the same server lockout and CAPTCHA verification as Web. */
export async function passwordLogin(email: string, password: string, captchaToken?: string) {
  const base = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '');
  if (!validMobileApiOrigin(base)) {
    throw new MobileLoginError('invalid_base_url', 'アプリの接続先設定が正しくありません。');
  }
  const response = await authFetch(`${base}/api/mobile/password-login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password, ...(captchaToken ? { captchaToken } : {}) }),
  });
  const result = await response.json().catch(() => null) as {
    code?: string; session?: { access_token?: string; refresh_token?: string };
  } | null;
  if (!response.ok) {
    if (result?.code === 'LOGIN_LOCKED') throw new MobileLoginError('LOGIN_LOCKED', 'ログイン試行回数の上限に達しています。30分後に再試行してください。');
    if (result?.code === 'BOT_PROTECTION_REQUIRED' || result?.code === 'BOT_PROTECTION_FAILED') {
      throw new MobileLoginError('BOT_PROTECTION_REQUIRED', 'ボット対策の確認をやり直してください。');
    }
    if (response.status >= 500) throw new MobileLoginError('LOGIN_SECURITY_CHECK_FAILED', 'ログインの確認処理を利用できません。時間をおいて再試行してください。');
    throw new MobileLoginError('INVALID_CREDENTIALS', 'ログインできませんでした。メールアドレスとパスワードを確認してください。');
  }
  if (!result?.session?.access_token || !result.session.refresh_token) throw new MobileLoginError('LOGIN_SESSION_INVALID', 'ログイン情報を確認できませんでした。');
  const { error } = await supabase.auth.setSession({ access_token: result.session.access_token, refresh_token: result.session.refresh_token });
  if (error) throw new MobileLoginError('LOGIN_SESSION_SAVE_FAILED', 'ログイン状態を保存できませんでした。もう一度お試しください。');
}
