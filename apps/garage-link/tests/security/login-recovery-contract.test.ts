import { expect, test } from '@playwright/test';
import {
  classifyPasswordLoginFailure,
  loginErrorMessage,
} from '../../src/lib/auth/login-error-contract';
import {
  getSupabaseAuthCookieNames,
  isRecoverableStaleSessionError,
} from '../../src/lib/auth/stale-session-recovery';

test.describe('ログイン回復と安全な失敗契約', () => {
  test('refresh token not foundだけを回復可能なstale sessionとして分類する', () => {
    expect(isRecoverableStaleSessionError({
      code: 'refresh_token_not_found',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
      status: 400,
    })).toBe(true);
    expect(isRecoverableStaleSessionError({ message: 'Invalid Refresh Token: Refresh Token Not Found' })).toBe(true);
    expect(isRecoverableStaleSessionError({ code: 'network_error', message: 'fetch failed' })).toBe(false);
    expect(isRecoverableStaleSessionError({ code: 'refresh_token_not_found', status: 503 })).toBe(false);
  });

  test('Supabase認証cookieの本体とchunkだけを対象にする', () => {
    expect(getSupabaseAuthCookieNames([
      { name: 'sb-gaytoojzwqkpuvfofeql-auth-token' },
      { name: 'sb-gaytoojzwqkpuvfofeql-auth-token.0' },
      { name: 'sb-gaytoojzwqkpuvfofeql-auth-token-code-verifier' },
      { name: 'garage_admin_email_verified' },
      { name: 'other-session' },
    ])).toEqual([
      'sb-gaytoojzwqkpuvfofeql-auth-token',
      'sb-gaytoojzwqkpuvfofeql-auth-token.0',
    ]);
  });

  test('ログイン失敗は内部文言を返さない固定コードと日本語に分類する', () => {
    expect(classifyPasswordLoginFailure({ code: 'invalid_credentials', status: 400 }, false)).toBe('INVALID_CREDENTIALS');
    expect(classifyPasswordLoginFailure({ code: 'captcha_failed', status: 400 }, false)).toBe('BOT_PROTECTION_REQUIRED');
    expect(classifyPasswordLoginFailure({ code: 'captcha_failed', status: 400 }, true)).toBe('BOT_PROTECTION_FAILED');
    expect(classifyPasswordLoginFailure({ code: 'unexpected_failure', status: 500 }, false)).toBe('AUTH_SERVICE_UNAVAILABLE');
    expect(loginErrorMessage('LOGIN_LOCKED')).toBe('ログイン試行回数の上限に達しました。30分後に再試行してください。');
    expect(loginErrorMessage('database secret leaked')).toBe('ログインを完了できませんでした。時間をおいて再試行してください。');
  });
});
