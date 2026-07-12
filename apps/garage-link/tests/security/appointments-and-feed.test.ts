import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('在庫フィード・予約・問い合わせ紐付け', () => {
  test('予約と問い合わせの紐付けは店舗分離される', async () => {
    const schema = await readFile('supabase/schema/045_appointments_and_inquiry_links.sql', 'utf8');
    expect(schema).toContain('create table if not exists public.appointments');
    expect(schema).toContain('vehicle_id uuid references public.vehicles');
    expect(schema).toContain('deal_id uuid references public.deals');
    expect(schema).toContain('current_user_store_ids()');
    expect(schema).toContain("'無断キャンセル'");
  });

  test('在庫フィードは公開在庫だけをCSVへ出す', async () => {
    const source = await readFile('src/lib/vehicles/vehicle-feed.ts', 'utf8');
    expect(source).toContain("['在庫中', '展示中', 'in_stock']");
    expect(source).toContain('googleVehicleFeedCsv');
    expect(source).toContain('vehicleFeedCsv');
    expect(source).toContain('used');
  });
});
