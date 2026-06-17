import 'server-only';
import crypto from 'node:crypto';

export function verifyLineSignature({
  body,
  channelSecret,
  signature,
}: {
  body: string;
  channelSecret: string;
  signature: string | null;
}) {
  if (!body || !channelSecret || !signature) return false;

  const expected = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sanitizeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 200);
  if (typeof error === 'string') return error.slice(0, 200);
  return 'unknown_error';
}
