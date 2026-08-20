export const LOGIN_ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'LOGIN_LOCKED',
  'BOT_PROTECTION_REQUIRED',
  'BOT_PROTECTION_FAILED',
  'LOGIN_SECURITY_CHECK_FAILED',
  'AUTH_SERVICE_UNAVAILABLE',
  'UNKNOWN_LOGIN_ERROR',
] as const;

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

type AuthFailure = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  INVALID_CREDENTIALS: 'メールアドレスまたはパスワードが正しくありません。',
  LOGIN_LOCKED: 'ログイン試行回数の上限に達しました。30分後に再試行してください。',
  BOT_PROTECTION_REQUIRED: 'ボット対策の確認を完了してください。',
  BOT_PROTECTION_FAILED: 'ボット対策を確認できませんでした。もう一度お試しください。',
  LOGIN_SECURITY_CHECK_FAILED: 'ログインの安全確認に失敗しました。時間をおいて再試行してください。',
  AUTH_SERVICE_UNAVAILABLE: '認証サービスに接続できませんでした。時間をおいて再試行してください。',
  UNKNOWN_LOGIN_ERROR: 'ログインを完了できませんでした。時間をおいて再試行してください。',
};

export function loginErrorMessage(code: unknown): string {
  return typeof code === 'string' && code in LOGIN_ERROR_MESSAGES
    ? LOGIN_ERROR_MESSAGES[code as LoginErrorCode]
    : LOGIN_ERROR_MESSAGES.UNKNOWN_LOGIN_ERROR;
}

export function classifyPasswordLoginFailure(
  failure: AuthFailure | null | undefined,
  captchaSubmitted: boolean,
): LoginErrorCode {
  const code = failure?.code?.toLowerCase() ?? '';
  const message = failure?.message?.toLowerCase() ?? '';
  const isCaptchaFailure = code.includes('captcha') || message.includes('captcha') || message.includes('turnstile');

  if (code === 'invalid_credentials') return 'INVALID_CREDENTIALS';
  if (isCaptchaFailure) return captchaSubmitted ? 'BOT_PROTECTION_FAILED' : 'BOT_PROTECTION_REQUIRED';
  if ((failure?.status ?? 0) >= 500 || code === 'unexpected_failure') return 'AUTH_SERVICE_UNAVAILABLE';
  return 'UNKNOWN_LOGIN_ERROR';
}
