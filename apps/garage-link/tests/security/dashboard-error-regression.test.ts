import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { toUserErrorMessage } from '../../src/lib/errors/user-error';

test.describe('ダッシュボードのエラー回帰', () => {
  test('整備案件番号は実在するjob_no列から取得する', async () => {
    const [sql, productionPatch, todayActions] = await Promise.all([
      readFile('supabase/migrations/20260724000200_garage_dashboard_payload.sql', 'utf8'),
      readFile('supabase/migrations/20260725010000_fix_garage_dashboard_maintenance_job_number.sql', 'utf8'),
      readFile('src/app/dashboard/today-actions/page.tsx', 'utf8'),
    ]);

    expect(sql).toContain('job.job_no as reception_no');
    expect(sql).not.toContain('job.reception_no');
    expect(productionPatch).toContain("'job.reception_no'");
    expect(productionPatch).toContain("'job.job_no as reception_no'");
    expect(todayActions).toContain('reception_no:job_no');
    expect(todayActions).not.toContain('id, reception_no, vehicle_id');
  });

  test('存在しない列のDBエラーを利用者向け日本語へ変換する', () => {
    expect(toUserErrorMessage('column job.reception_no does not exist', 'ダッシュボードの取得に失敗しました。')).toBe(
      '必要なデータ項目が見つかりません。管理者にお問い合わせください。',
    );
  });

  test('ダッシュボードはDBエラーをそのまま画面へ出さない', async () => {
    const dashboard = await readFile('src/app/dashboard/page.tsx', 'utf8');

    expect(dashboard).toContain('toUserErrorMessage');
    expect(dashboard).toContain("setErrorMessage(toUserErrorMessage(");
  });
});
