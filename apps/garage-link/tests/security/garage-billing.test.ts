import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  GARAGE_PLANS,
  canAddStaff,
  canAddStorage,
  canAddStore,
  canAddVehicle,
  canCreateDocument,
  canUseLLinkIntegration,
  getStorageLimit,
} from '../../src/lib/billing/garagePlans';
import { isCurrentInventoryVehicle } from '../../src/lib/billing/garageSubscription';

test.describe('GARAGE LINK billing and plan safety', () => {
  test('料金プラン定義は指定仕様と一致する', () => {
    expect(GARAGE_PLANS.free).toMatchObject({
      monthlyPrice: 0,
      inventoryLimit: 5,
      includedStaffCount: 1,
      includedStoreCount: 1,
      storageLimitMb: 500,
      quoteInvoiceLimit: 5,
      lLinkIntegrationEnabled: false,
    });
    expect(GARAGE_PLANS.starter).toMatchObject({
      monthlyPrice: 6800,
      inventoryLimit: 50,
      includedStaffCount: 1,
      includedStoreCount: 1,
      storageLimitMb: 2048,
      quoteInvoiceLimit: 20,
      lLinkIntegrationEnabled: false,
    });
    expect(GARAGE_PLANS.standard).toMatchObject({
      monthlyPrice: 14800,
      inventoryLimit: 200,
      includedStaffCount: 3,
      includedStoreCount: 1,
      storageLimitMb: 10240,
      quoteInvoiceLimit: null,
      lLinkIntegrationEnabled: true,
    });
    expect(GARAGE_PLANS.pro).toMatchObject({
      monthlyPrice: 29800,
      inventoryLimit: 500,
      includedStaffCount: 10,
      includedStoreCount: 3,
      storageLimitMb: 51200,
      quoteInvoiceLimit: null,
      lLinkIntegrationEnabled: true,
    });
  });

  test('プラン別の追加オプション可否を判定できる', () => {
    expect(canAddStaff('free')).toBeFalsy();
    expect(canAddStaff('starter')).toBeTruthy();

    expect(canAddStore('free')).toBeFalsy();
    expect(canAddStore('starter')).toBeFalsy();
    expect(canAddStore('standard')).toBeTruthy();
    expect(canAddStore('pro')).toBeTruthy();

    expect(canAddStorage('free')).toBeFalsy();
    expect(canAddStorage('starter')).toBeTruthy();

    expect(canUseLLinkIntegration({ plan: 'free', l_link_integration_enabled: false })).toBeFalsy();
    expect(canUseLLinkIntegration({ plan: 'starter', l_link_integration_enabled: false })).toBeFalsy();
    expect(canUseLLinkIntegration({ plan: 'standard', l_link_integration_enabled: true })).toBeTruthy();
    expect(canUseLLinkIntegration({ plan: 'pro', l_link_integration_enabled: true })).toBeTruthy();
  });

  test('車両登録上限と現在庫対象ステータスを判定できる', () => {
    expect(canAddVehicle({ plan: 'free', current_inventory_limit: 5 }, 4)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(canAddVehicle({ plan: 'free', current_inventory_limit: 5 }, 5)).toMatchObject({
      allowed: false,
      remaining: 0,
    });

    expect(isCurrentInventoryVehicle({ status: '在庫中' })).toBeTruthy();
    expect(isCurrentInventoryVehicle({ status: '商談中' })).toBeTruthy();
    expect(isCurrentInventoryVehicle({ status: '売却済み' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: '納車済み' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: 'sold' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: 'delivered' })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: '在庫中', is_archived: true })).toBeFalsy();
    expect(isCurrentInventoryVehicle({ status: '在庫中', deleted_at: '2026-06-16T00:00:00.000Z' })).toBeFalsy();
  });

  test('見積・請求の月間合算上限を判定できる', () => {
    expect(canCreateDocument({ plan: 'free' }, 4)).toMatchObject({ allowed: true, remaining: 1 });
    expect(canCreateDocument({ plan: 'free' }, 5)).toMatchObject({ allowed: false, remaining: 0 });

    expect(canCreateDocument({ plan: 'starter' }, 19)).toMatchObject({ allowed: true, remaining: 1 });
    expect(canCreateDocument({ plan: 'starter' }, 20)).toMatchObject({ allowed: false, remaining: 0 });

    expect(canCreateDocument({ plan: 'standard' }, 999)).toMatchObject({ allowed: true, limit: null });
    expect(canCreateDocument({ plan: 'pro' }, 999)).toMatchObject({ allowed: true, limit: null });
  });

  test('ストレージ上限は標準と追加容量を合算する', () => {
    expect(getStorageLimit({ plan: 'free', storage_limit_mb: 500, extra_storage_gb: 0 })).toBe(500);
    expect(getStorageLimit({ plan: 'starter', storage_limit_mb: 2048, extra_storage_gb: 20 })).toBe(22528);
  });

  test('030 SQLは契約テーブル・申込テーブル・completed反映RPCを含む', async () => {
    const sql = await readFile('supabase/schema/030_company_billing_requests.sql', 'utf8');

    expect(sql).toContain('create table if not exists public.company_subscriptions');
    expect(sql).toContain('create table if not exists public.plan_change_requests');
    expect(sql).toContain('create index if not exists');
    expect(sql).toContain('drop policy if exists');
    expect(sql).toContain('create policy');
    expect(sql).toContain('completed_at timestamptz');
    expect(sql).toContain('add column if not exists completed_at');
    expect(sql).toContain('create or replace function public.complete_plan_change_request');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain('for update');
    expect(sql).toContain('completed_at is not null');
    expect(sql).toContain("request_type in ('plan_change', 'add_staff', 'add_store', 'add_storage', 'support')");
    expect(sql).toContain("status in ('pending', 'approved', 'rejected', 'completed')");
    expect(sql).toContain('l_link_integration_enabled = v_plan in');
    expect(sql).toContain('grant execute on function public.complete_plan_change_request(uuid) to authenticated');
  });

  test('管理画面はcompleted反映RPCを呼び、契約テーブルを直接加算しない', async () => {
    const source = await readFile('src/app/admin/plan-requests/page.tsx', 'utf8');

    expect(source).toContain("supabase.rpc('complete_plan_change_request'");
    expect(source).not.toContain("from('company_subscriptions')");
    expect(source).toContain('この申込は既に契約へ反映済みです。');
  });

  test('設定画面の主要文言はL-Link連携・申し込む表記に統一されている', async () => {
    const billingPage = await readFile('src/app/settings/billing/page.tsx', 'utf8');
    const lLinkPage = await readFile('src/app/settings/l-link/page.tsx', 'utf8');

    expect(billingPage).toContain('L-Link連携');
    expect(billingPage).toContain('申し込む');
    expect(billingPage).toContain('標準スタッフ数 / 追加スタッフ数');
    expect(billingPage).toContain('標準店舗数 / 追加店舗数');
    expect(billingPage).toContain('標準ストレージ / 追加ストレージ');
    expect(billingPage).toContain('追加するスタッフ数');
    expect(billingPage).toContain('追加する店舗数');
    expect(billingPage).toContain('追加するストレージ容量');

    expect(`${billingPage}\n${lLinkPage}`).not.toContain('LINE基本連携');
    expect(lLinkPage).toContain('L-Link連携はStandard以上で利用できます。');
  });
});
