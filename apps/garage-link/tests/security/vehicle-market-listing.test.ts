import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('車両の相場・媒体掲載状態', () => {
  test('相場は出所・確認日・条件を持ち、掲載状態は店舗RLSで分離される', async () => {
    const schema = await readFile('supabase/schema/044_vehicle_market_and_listing_status.sql', 'utf8');
    const migration = await readFile('supabase/migrations/20260712000000_vehicle_market_and_listing_status.sql', 'utf8');

    for (const column of ['market_source', 'market_checked_at', 'market_conditions', 'market_note']) {
      expect(schema).toContain(column);
    }
    expect(schema).toContain('create table if not exists public.vehicle_listing_statuses');
    expect(schema).toContain("channel in ('Goo', 'カーセンサー', '自社サイト', 'Google')");
    expect(schema).toContain("status in ('未掲載', '掲載中', 'エラー', '停止')");
    expect(schema).toContain('current_user_store_ids()');
    expect(schema).toContain('grant select, insert, update, delete on public.vehicle_listing_statuses to authenticated');
    expect(migration).toContain('supabase/schema/044_vehicle_market_and_listing_status.sql');
    expect(migration).toContain('create table if not exists public.vehicle_listing_statuses');
  });

  test('車両詳細は相場の出所・更新日・条件と媒体状態を表示する', async () => {
    const page = await readFile('src/app/vehicles/[id]/page.tsx', 'utf8');
    expect(page).toContain('参考相場');
    expect(page).toContain('market_source');
    expect(page).toContain('vehicle_listing_statuses');
    expect(page).toContain('次にすること');
    expect(page).toContain('相場未確認');
  });
});
