import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('UX role acceptance remediation', () => {
  test('membership edits compare against the last persisted snapshot and validate RPC results', async () => {
    const source = await readFile('src/app/settings/members/page.tsx', 'utf8');

    expect(source).toContain('const [persistedMembers, setPersistedMembers]');
    expect(source).toContain('setPersistedMembers(loadedMembers)');
    expect(source).toContain('const beforeMember = persistedMembers.find');
    expect(source).not.toContain('const beforeMember = members.find');
    expect(source).toContain("if (!(data as { ok?: boolean } | null)?.ok) throw new Error('権限変更を完了できませんでした。')");
    expect(source).toContain("if (!(data as { ok?: boolean } | null)?.ok) throw new Error('ステータス変更を完了できませんでした。')");
  });

  test('inventory conflict keeps the staff role contract and exposes a recoverable message', async () => {
    const [page, errors, migration] = await Promise.all([
      readFile('src/app/inventory-counts/new/page.tsx', 'utf8'),
      readFile('src/lib/errors/translate-db-error.ts', 'utf8'),
      readFile('supabase/migrations/20260728000100_high_remediation_batch.sql', 'utf8'),
    ]);

    expect(page).toContain("supabase.rpc('create_inventory_count'");
    expect(page).toContain("disabled={isSaving}");
    expect(errors).toContain('inventory_counts_one_active_store_uidx');
    expect(errors).toContain('一覧から既存の棚卸しを再開してください。');
    expect(migration).toContain("v_role is null or v_role not in ('owner','admin','staff')");
  });
});
