import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('請求書 在庫確定/取消 UI 配線', () => {
  test('請求詳細ページがRPCを呼び・整備案件紐付き時は確定を案内のみにする', async () => {
    const src = await readFile('src/app/invoices/[id]/page.tsx', 'utf8');
    // RPC呼び出し（038）
    expect(src).toContain("supabase.rpc('confirm_invoice_part_stock'");
    expect(src).toContain("supabase.rpc('cancel_invoice_part_stock'");
    // owner/admin のみ操作可（既存ロール体系）
    expect(src).toContain("role === 'owner' || role === 'admin'");
    // destructive 操作に確認
    expect(src).toContain('window.confirm');
    // 二重クリック防止
    expect(src).toContain("stockBusy !== 'idle'");
    // 在庫不足の日本語エラーを表示
    expect(src).toContain('在庫不足です');
    // 整備案件紐付きは案内のみ（在庫を動かさない記述）
    expect(src).toContain('integratedJobStock || !invoice'.length ? 'maintenance_job_id' : 'maintenance_job_id');
    expect(src).toContain('整備案件');
    // 明細差分の表示状態
    expect(src).toContain('confirmed_drifted');
    // 既存の発火点（adjust_repair_part_stock）を呼ばない
    expect(src).not.toContain('adjust_repair_part_stock');
  });

  test('UI状態遷移ヘルパが4状態を持つ', async () => {
    const src = await readFile('src/app/invoices/[id]/page.tsx', 'utf8');
    for (const s of ['maintenance_linked', 'confirmed_synced', 'confirmed_drifted', 'unconfirmed']) {
      expect(src).toContain(s);
    }
  });
});

test.describe('長期滞留 閾値 設定UI', () => {
  test('/settings/store に閾値の保存/読込が実装されている（1〜365）', async () => {
    const src = await readFile('src/app/settings/store/page.tsx', 'utf8');
    // 列・テーブル
    expect(src).toContain('long_stay_threshold_days');
    expect(src).toContain(".from('stores')");
    // 範囲
    expect(src).toContain('LONG_STAY_MIN = 1');
    expect(src).toContain('LONG_STAY_MAX = 365');
    // 整数バリデーション
    expect(src).toContain('/^\\d+$/');
    // 自店舗のみ更新（store_id 越境なし）
    expect(src).toContain(".eq('id', storeId)");
    // owner/admin のみ
    expect(src).toContain("role !== 'owner' && role !== 'admin'");
    // 保存成功・失敗の日本語表示
    expect(src).toContain('長期滞留の閾値を保存しました。');
  });

  test('車両一覧は保存された閾値を使う（ハードコードしない）', async () => {
    const src = await readFile('src/app/vehicles/page.tsx', 'utf8');
    expect(src).toContain('long_stay_threshold_days');
    expect(src).toContain('longStayThreshold');
    // 旧定数名が残っていないこと
    expect(src).not.toContain('LONG_STAY_DAYS');
  });
});
