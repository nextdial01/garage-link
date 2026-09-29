import { validMobileApiOrigin } from './apiOrigin';
import { authFetch } from './authTransport';

export type CaptchaProps = { attempt: number; onState: (ready: boolean, token?: string) => void };
export function captchaUrl() {
  const base = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '');
  if (!validMobileApiOrigin(base)) throw new Error('CAPTCHA_ORIGIN_INVALID');
  return `${base}/api/auth/mobile-captcha`;
}
export async function loadCaptchaConfig() {
  const response = await authFetch(`${captchaUrl()}?format=config`, { credentials: 'omit' });
  const value = await response.json();
  if (!response.ok || typeof value?.enabled !== 'boolean' || (value.enabled && (typeof value.siteKey !== 'string' || !/^[a-zA-Z0-9_-]{3,200}$/.test(value.siteKey)))) throw new Error('CAPTCHA_CONFIG_UNAVAILABLE');
  return value as { enabled: boolean; siteKey: string | null };
}
export function readCaptchaMessage(url: string, expectedUrl: string, raw: string): { ready: boolean; token?: string } | null {
  if (url !== expectedUrl || raw.length > 4096) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.type === 'captcha-token' && typeof value.token === 'string' && value.token.length > 0 && value.token.length <= 2048 && !/\s/.test(value.token)) return { ready: true, token: value.token };
    if (value?.type === 'captcha-expired' || value?.type === 'captcha-error') return { ready: false };
  } catch { /* Reject malformed bridge data. */ }
  return null;
}
export function allowedCaptchaNavigation(url: string, expectedUrl: string, isTopFrame?: boolean) {
  if (url === expectedUrl || url === 'about:blank' || url === 'about:srcdoc') return true;
  try { return isTopFrame !== true && new URL(url).origin === 'https://challenges.cloudflare.com'; } catch { return false; }
}
