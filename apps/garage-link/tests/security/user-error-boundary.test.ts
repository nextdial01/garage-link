import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { toUserErrorMessage } from '../../src/lib/errors/user-error';

async function listTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [entryPath] : [];
  }));
  return paths.flat();
}

test.describe('利用者向けエラー境界', () => {
  test('内部エラーを直接表示せず、既知のDBエラーだけ安全な日本語へ変換する', () => {
    expect(toUserErrorMessage(new Error('column jobs.missing does not exist'), '取得に失敗しました。')).toBe(
      '必要なデータ項目が見つかりません。管理者にお問い合わせください。',
    );
    expect(toUserErrorMessage(new Error('Network request failed'), '取得に失敗しました。')).toBe('取得に失敗しました。');
    expect(toUserErrorMessage(new Error('保存対象が見つかりません。'), '保存に失敗しました。')).toBe('保存に失敗しました。');
    expect(toUserErrorMessage(
      new Error('duplicate key value violates unique constraint "inventory_counts_one_active_store_uidx"'),
      '保存に失敗しました。',
    )).toBe('棚卸し中の案件が既にあります。一覧から既存の棚卸しを再開してください。');
  });

  test('画面のcatchで例外messageを状態やalertへ直接渡さない', async () => {
    const files = await listTsxFiles('src');
    const unsafePattern = /(?:set[A-Za-z]\w*|window\.alert)\(\s*(?:error|err|e) instanceof Error\s*\?\s*(?:error|err|e)\.message\s*:/g;
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (unsafePattern.test(source)) violations.push(file);
      unsafePattern.lastIndex = 0;
    }

    expect(violations, `英語の生エラーを表示し得る画面: ${violations.join(', ')}`).toEqual([]);
  });

  test('API応答と保存ログのerror文字列を画面へ直接表示しない', async () => {
    const files = await listTsxFiles('src');
    const unsafePatterns = [
      /(?:set[A-Za-z]\w*|window\.alert)\(\s*(?:result|data|payload)\??\.error\b/g,
      /displayValue\(\w+\.error_(?:message|detail)\)/g,
      /\{\w+\.error_(?:message|detail)\s*(?:\?\?|\|\|)/g,
    ];
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (unsafePatterns.some((pattern) => {
        const matched = pattern.test(source);
        pattern.lastIndex = 0;
        return matched;
      })) violations.push(file);
    }

    expect(violations, `API・保存ログの生エラーを表示し得る画面: ${violations.join(', ')}`).toEqual([]);
  });
});
