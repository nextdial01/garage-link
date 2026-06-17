import 'server-only';
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY ?? process.env.L_LINK_APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('encryption_key_missing');
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to hash-based derivation
  }

  return crypto.createHash('sha256').update(raw).digest();
}

export function hasEncryptionKey() {
  return Boolean(process.env.APP_ENCRYPTION_KEY ?? process.env.L_LINK_APP_ENCRYPTION_KEY);
}

export function encryptSecret(value: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const [version, ivValue, tagValue, encryptedValue] = value.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('invalid_encrypted_secret');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function getLast4(value: string) {
  return value.slice(-4);
}

export function maskSecret(last4?: string | null) {
  return last4 ? `************${last4}` : '未設定';
}
