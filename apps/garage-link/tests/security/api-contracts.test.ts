import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('API security contracts', () => {
  test('line_friends exportはline_user_idや内部IDを出力しない', async () => {
    const source = await readFile('src/lib/security/csvTargets.ts', 'utf8');
    const lineFriendConfig = source.slice(
      source.indexOf('export const lineFriendCsvConfig'),
      source.indexOf('export function csvExportFileName')
    );

    expect(lineFriendConfig).toContain("table: 'line_friends'");
    expect(lineFriendConfig).not.toContain('line_user_id');
    expect(lineFriendConfig).not.toContain("'id'");
    expect(lineFriendConfig).not.toContain('customer_id');
    expect(lineFriendConfig).not.toContain('raw_event');
    expect(lineFriendConfig).not.toContain('message_text');
  });

  test('CSV importはCSV内tenant/store列を許可しない設定になっている', async () => {
    const source = await readFile('src/lib/security/csvTargets.ts', 'utf8');
    const forbiddenColumns = ['tenant_id', 'store_id', 'created_by', 'updated_by', 'role', 'owner', 'admin'];

    const customerConfig = source.slice(
      source.indexOf('export const customerCsvConfig'),
      source.indexOf('export const vehicleCsvConfig')
    );
    const vehicleConfig = source.slice(
      source.indexOf('export const vehicleCsvConfig'),
      source.indexOf('export const lineFriendCsvConfig')
    );

    for (const column of forbiddenColumns) {
      expect(customerConfig).not.toContain(`'${column}'`);
      expect(vehicleConfig).not.toContain(`'${column}'`);
    }
  });

  test('line_form_answers / line_form_responses export APIを作っていない', async () => {
    const source = await readFile('src/lib/security/csvTargets.ts', 'utf8');

    expect(source).not.toContain("table: 'line_form_answers'");
    expect(source).not.toContain("table: 'line_form_responses'");
  });
});
