import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { verifyLineSignature } from '../../src/lib/line/verifySignature';

function sign(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

test.describe('LINE webhook signature', () => {
  test('raw bodyで作った正しい署名だけを許可する', () => {
    const secret = 'line-channel-secret-for-security-test';
    const rawBody = '{"events":[{"type":"message","message":{"type":"text","text":"hello"}}]}';
    const signature = sign(rawBody, secret);

    expect(verifyLineSignature({ body: rawBody, channelSecret: secret, signature })).toBeTruthy();
    expect(verifyLineSignature({ body: `${rawBody}\n`, channelSecret: secret, signature })).toBeFalsy();
    expect(verifyLineSignature({ body: rawBody, channelSecret: secret, signature: 'invalid' })).toBeFalsy();
    expect(verifyLineSignature({ body: rawBody, channelSecret: '', signature })).toBeFalsy();
  });
});
