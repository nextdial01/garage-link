import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  DEFAULT_TIMINGS,
  isValidOffsetDays,
  validateTimings,
} from '../../src/lib/inspection-reminders/shared';

test.describe('車検案内: タイミング検証ロジック', () => {
  test('1〜365の整数のみ許可する', () => {
    expect(isValidOffsetDays(1)).toBe(true);
    expect(isValidOffsetDays(365)).toBe(true);
    expect(isValidOffsetDays(0)).toBe(false);
    expect(isValidOffsetDays(366)).toBe(false);
    expect(isValidOffsetDays(30.5)).toBe(false);
    expect(isValidOffsetDays('30')).toBe(false);
  });

  test('重複日数を拒否する', () => {
    const result = validateTimings([
      { offset_days: 30, enabled: true },
      { offset_days: 30, enabled: false },
    ]);
    expect(result.ok).toBe(false);
  });

  test('範囲外を拒否する', () => {
    expect(validateTimings([{ offset_days: 0, enabled: true }]).ok).toBe(false);
    expect(validateTimings([{ offset_days: 400, enabled: true }]).ok).toBe(false);
  });

  test('昇順に正規化する', () => {
    const result = validateTimings([
      { offset_days: 90, enabled: true },
      { offset_days: 30, enabled: true },
      { offset_days: 60, enabled: false },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timings.map((t) => t.offset_days)).toEqual([30, 60, 90]);
    }
  });

  test('初期タイミングは90/60/30', () => {
    expect(DEFAULT_TIMINGS.map((t) => t.offset_days)).toEqual([90, 60, 30]);
  });
});

test.describe('車検案内: migration(035)の不変条件', () => {
  test('テーブル・冪等性・状態・RLSが定義されている', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');

    // 3テーブル
    expect(sql).toContain('create table if not exists public.inspection_reminder_settings');
    expect(sql).toContain('create table if not exists public.inspection_reminder_timings');
    expect(sql).toContain('create table if not exists public.inspection_reminder_events');

    // 店舗単位・会社/店舗ID
    expect(sql).toContain('store_id uuid not null references public.stores(id)');
    expect(sql).toContain('company_id uuid references public.tenants(id)');

    // 1〜365の整数・店舗内重複不可
    expect(sql).toContain('offset_days between 1 and 365');
    expect(sql).toContain('unique (store_id, offset_days)');

    // イベント状態（5種）と生成直後pending・event_type
    expect(sql).toContain("status in ('pending', 'processing', 'completed', 'skipped', 'failed')");
    expect(sql).toContain("status text not null default 'pending'");
    expect(sql).toContain("event_type text not null default 'inspection_reminder'");

    // 冪等性キーのユニーク制約
    expect(sql).toContain('idempotency_key text not null');
    expect(sql).toContain('unique (idempotency_key)');

    // nullable な外部連携先ID・エラー内容
    expect(sql).toContain('external_reference_id text');
    expect(sql).toContain('error_detail text');

    // RLS有効化と参照/変更ポリシー
    expect(sql).toContain('alter table public.inspection_reminder_events enable row level security');
    expect(sql).toContain('current_user_store_ids()');
    expect(sql).toContain("role in ('owner', 'admin')");
  });

  test('生成関数: Asia/Tokyo基準・除外条件・顧客紐付け・冪等INSERT', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');

    expect(sql).toContain('create or replace function public.generate_inspection_reminder_events');
    expect(sql).toContain("now() at time zone 'Asia/Tokyo'");

    // 残日数 = タイミング
    expect(sql).toContain('(v.inspection_expiry_date - v_today) = t.offset_days');

    // 除外: 売約済み / 廃車 / 削除済み / アーカイブ / 満了日null
    expect(sql).toContain("v.status, '') not in ('売約済み', 'sold')");
    expect(sql).toContain("v.status, '') not in ('廃車', 'scrapped')");
    expect(sql).toContain('v.deleted_at is null');
    expect(sql).toContain('coalesce(v.is_archived, false) = false');
    expect(sql).toContain('v.inspection_expiry_date is not null');

    // 車検予約済み・入庫済みの除外
    expect(sql).toContain("not in ('completed', 'delivered', 'cancelled')");
    expect(sql).toContain("mj2.job_type = '車検' or mj2.scheduled_in_at is not null or mj2.actual_in_date is not null");

    // 顧客に紐づく車両のみ・冪等INSERT
    expect(sql).toContain('where customer_id is not null');
    expect(sql).toContain('on conflict (idempotency_key) do nothing');
  });
});
