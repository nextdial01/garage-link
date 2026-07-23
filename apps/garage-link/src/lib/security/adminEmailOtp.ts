const encoder = new TextEncoder();

export const ADMIN_EMAIL_OTP_COOKIE = 'garage_admin_email_verified';
export const ADMIN_DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;

function base64UrlEncode(value: string) {
  const bytes = encoder.encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function getAdminEmailOtpSecret() {
  return process.env.GARAGE_ADMIN_EMAIL_OTP_SECRET
    ?? process.env.GARAGE_LOGIN_SECURITY_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? '';
}

export function randomOtpCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

export function randomDeviceToken() {
  const values = new Uint8Array(32);
  crypto.getRandomValues(values);
  return Array.from(values, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function emailHash(secret: string, email: string) {
  return hmacHex(secret, `garage-link:admin-email:v1:${email.trim().toLowerCase()}`);
}

export function otpHash(secret: string, userId: string, sessionId: string, code: string) {
  return hmacHex(secret, `garage-link:admin-otp:v1:${userId}:${sessionId}:${code}`);
}

export function deviceTokenHash(secret: string, token: string) {
  return hmacHex(secret, `garage-link:admin-device:v1:${token}`);
}

export function maskEmail(email: string) {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '登録済みメールアドレス';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

type TrustedDevicePayload = { userId: string; sessionId: string; token: string; expiresAt: number };

export async function createTrustedDeviceCookieValue(secret: string, payload: TrustedDevicePayload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(secret, `garage-link:admin-cookie:v1:${encoded}`);
  return `${encoded}.${signature}`;
}

export async function readTrustedDeviceCookieValue(secret: string, value: string | undefined, expectedUserId: string, expectedSessionId: string) {
  if (!secret || !value) return null;
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;
  const expectedSignature = await hmacHex(secret, `garage-link:admin-cookie:v1:${encoded}`);
  if (!safeEqual(signature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as TrustedDevicePayload;
    if (payload.userId !== expectedUserId || payload.sessionId !== expectedSessionId || !payload.token || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function trustedDeviceCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: ADMIN_DEVICE_TTL_SECONDS };
}

