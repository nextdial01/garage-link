import { expect, test } from '@playwright/test';
import {
  createCsvPreviewToken,
  parseCsv,
  rowsContainFormulaInjection,
  rowsToCsv,
  sanitizeCsvCell,
  validateCsvColumns,
  verifyCsvPreviewToken,
} from '../../src/lib/security/csvCore';
import { dangerousCsvValues } from './fixtures';

test.describe('CSV security', () => {
  test.beforeEach(() => {
    process.env.WEBHOOK_SIGNING_SECRET = 'security-test-signing-secret-at-least-32-bytes';
  });

  test('CSV式インジェクション値を無害化する', () => {
    for (const value of dangerousCsvValues) {
      expect(sanitizeCsvCell(value).startsWith("'")).toBeTruthy();
    }

    const csv = rowsToCsv(
      [{ name: '=HYPERLINK("https://evil.example","click")', memo: 'safe' }],
      ['name', 'memo']
    );

    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"",""click"")"`);
  });

  test('CSV内の危険な式候補を検出する', () => {
    expect(rowsContainFormulaInjection([{ name: '+SUM(1,2)' }])).toBeTruthy();
    expect(rowsContainFormulaInjection([{ name: 'Honda' }])).toBeFalsy();
  });

  test('tenant_id/store_idなど許可外カラムを拒否する', () => {
    const allowed = ['name', 'phone', 'email'];

    expect(() => validateCsvColumns(['name', 'phone'], allowed)).not.toThrow();
    expect(() => validateCsvColumns(['name', 'tenant_id'], allowed)).toThrow('許可されていないカラム');
    expect(() => validateCsvColumns(['name', 'store_id'], allowed)).toThrow('許可されていないカラム');
    expect(() => validateCsvColumns(['name', 'role'], allowed)).toThrow('許可されていないカラム');
  });

  test('preview tokenなし・改ざん・別store/userのcommitを拒否できる', () => {
    const rows = [{ name: 'E2E 顧客', phone: '09000000000' }];
    const token = createCsvPreviewToken({
      targetTable: 'customers',
      storeId: 'store-a',
      userId: 'user-a',
      rows,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(() => verifyCsvPreviewToken({
      token,
      targetTable: 'customers',
      storeId: 'store-a',
      userId: 'user-a',
      rows,
    })).not.toThrow();

    expect(() => verifyCsvPreviewToken({
      token,
      targetTable: 'customers',
      storeId: 'store-b',
      userId: 'user-a',
      rows,
    })).toThrow('preview tokenの対象が一致しません');

    expect(() => verifyCsvPreviewToken({
      token,
      targetTable: 'customers',
      storeId: 'store-a',
      userId: 'user-b',
      rows,
    })).toThrow('preview tokenの対象が一致しません');

    expect(() => verifyCsvPreviewToken({
      token,
      targetTable: 'customers',
      storeId: 'store-a',
      userId: 'user-a',
      rows: [{ name: '改ざん', phone: '09000000000' }],
    })).toThrow('preview後にCSV内容が変更されています');
  });

  test('CSV parserはヘッダーと行を安定して読む', () => {
    const parsed = parseCsv('name,memo\r\n"Honda, CB400","quoted ""memo"""');

    expect(parsed.headers).toEqual(['name', 'memo']);
    expect(parsed.rows).toEqual([{ name: 'Honda, CB400', memo: 'quoted "memo"' }]);
  });
});
