export const ADMIN_ACCESS_COOKIE = 'garage_admin_access';

const encoder = new TextEncoder();

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function adminAccessCookieValue(secret: string, userId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(secret, `garage-link:admin-access:v3:${userId}:${issuedAt}`);
  return `v3.${issuedAt}.${signature}`;
}

export async function verifyAdminAccessCookie(secret: string, userId: string, value: string) {
  const [version, issuedAtRaw, signature] = value.split('.');
  const issuedAt = Number(issuedAtRaw);
  const now = Math.floor(Date.now() / 1000);
  if (version !== 'v3' || !Number.isInteger(issuedAt) || !signature) return false;
  if (issuedAt > now + 300 || now - issuedAt > 60 * 60 * 12) return false;
  const expected = await hmacHex(secret, `garage-link:admin-access:v3:${userId}:${issuedAt}`);
  return equalHash(signature, expected);
}

export function loginIdentityHash(secret: string, email: string) {
  return hmacHex(secret, `garage-link:login-lock:v1:${email.trim().toLowerCase()}`);
}

function equalHash(inputHash: string, expectedHash: string) {
  let difference = inputHash.length ^ expectedHash.length;
  for (let index = 0; index < Math.max(inputHash.length, expectedHash.length); index += 1) {
    difference |= (inputHash.charCodeAt(index) || 0) ^ (expectedHash.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function createAdminAccessSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashAdminAccessCode(code: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 120_000 },
    key,
    256
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyAdminAccessCode(input: string, salt: string, expectedHash: string) {
  return equalHash(await hashAdminAccessCode(input, salt), expectedHash);
}

export function secureReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  if (value.startsWith('/security/')) return '/dashboard';
  return value;
}
