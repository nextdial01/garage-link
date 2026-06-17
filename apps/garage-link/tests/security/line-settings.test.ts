import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { decryptSecret, encryptSecret, getLast4, maskSecret } from '../../src/lib/security/encryptionCore';

test.describe('LINE Secret protection', () => {
  test.beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = 'security-test-encryption-key-at-least-32-bytes';
  });

  test('secret/tokenをAES-GCM形式で暗号化し、last4だけ表示用に使う', () => {
    const secret = 'channel-secret-value-1234';
    const encrypted = encryptSecret(secret);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
    expect(getLast4(secret)).toBe('1234');
    expect(maskSecret('1234')).toBe('************1234');
  });

  test('LINE設定APIのsafeSettingsは平文・暗号文を返さない形を維持する', async () => {
    const source = await readFile('src/app/api/line/settings/route.ts', 'utf8');
    const safeSettingsSource = source.slice(
      source.indexOf('function safeSettings'),
      source.indexOf('async function getAuthorizedContext')
    );

    expect(safeSettingsSource).toContain('channel_secret_masked');
    expect(safeSettingsSource).toContain('channel_access_token_masked');
    expect(safeSettingsSource).not.toMatch(/\bchannel_secret\s*:/);
    expect(safeSettingsSource).not.toMatch(/\bchannel_access_token\s*:/);
    expect(safeSettingsSource).not.toMatch(/\bchannel_secret_encrypted\s*:/);
    expect(safeSettingsSource).not.toMatch(/\bchannel_access_token_encrypted\s*:/);
  });

  test('LINE設定画面のformStateに既存secret/tokenを保持しない', async () => {
    const [source, secretFieldSource] = await Promise.all([
      readFile('src/app/line/settings/page.tsx', 'utf8'),
      readFile('src/components/line/shared/LineSecretField.tsx', 'utf8'),
    ]);
    const formStateSource = source.slice(
      source.indexOf('type FormState'),
      source.indexOf('const emptyFormState')
    );

    expect(formStateSource).not.toContain('channel_secret');
    expect(formStateSource).not.toContain('channel_access_token');
    expect(source).toContain('LineSecretField');
    expect(secretFieldSource).toContain('placeholder="変更する場合のみ入力"');
    expect(secretFieldSource).toContain('defaultValue=""');
  });
});
