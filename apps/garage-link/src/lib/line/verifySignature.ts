import crypto from 'node:crypto';

export function verifyLineSignature({
  body,
  channelSecret,
  signature,
}: {
  body: string;
  channelSecret: string;
  signature: string;
}) {
  if (!channelSecret || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
