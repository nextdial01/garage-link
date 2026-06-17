import crypto from 'node:crypto';

const algorithm = 'aes-256-gcm';
const version = 'v1';

function getEncryptionKey() {
  const rawKey = process.env.APP_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error('APP_ENCRYPTION_KEY is not configured');
  }

  const trimmedKey = rawKey.trim();
  const hexKey = /^[0-9a-f]{64}$/i.test(trimmedKey)
    ? Buffer.from(trimmedKey, 'hex')
    : null;
  const base64Key = !hexKey ? Buffer.from(trimmedKey, 'base64') : null;

  if (hexKey?.length === 32) {
    return hexKey;
  }

  if (base64Key?.length === 32 && base64Key.toString('base64').replace(/=+$/, '') === trimmedKey.replace(/=+$/, '')) {
    return base64Key;
  }

  if (trimmedKey.length >= 32) {
    return crypto.createHash('sha256').update(trimmedKey).digest();
  }

  throw new Error('APP_ENCRYPTION_KEY must be at least 32 characters or a 32-byte base64/hex key');
}

export function encryptSecret(value: string) {
  const plainText = value.trim();

  if (!plainText) {
    throw new Error('Secret value is empty');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    version,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptSecret(encrypted: string) {
  const [storedVersion, ivBase64, authTagBase64, encryptedBase64] = encrypted.split(':');

  if (storedVersion !== version || !ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Encrypted secret format is invalid');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function getLast4(value: string) {
  return value.trim().slice(-4);
}

export function maskSecret(last4?: string | null) {
  return last4 ? `************${last4}` : '';
}
