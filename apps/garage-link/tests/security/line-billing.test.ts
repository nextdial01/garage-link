import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  LINE_PLANS,
  UNLIMITED_DELIVERY_OPTION,
  evaluateLineDeliveryUsage,
} from '../../src/lib/billing/linePlans';

test.describe('LINE package billing safety', () => {
  test('プラン定義は指定価格・上限・オプション条件を満たす', () => {
    expect(LINE_PLANS.FREE.monthlyPrice).toBe(0);
    expect(LINE_PLANS.FREE.monthlyDeliveryLimit).toBe(1000);
    expect(LINE_PLANS.FREE.overageEnabled).toBeFalsy();
    expect(LINE_PLANS.FREE.unlimitedOptionEnabled).toBeFalsy();

    expect(LINE_PLANS.LINE_BASIC.monthlyPrice).toBe(9800);
    expect(LINE_PLANS.LINE_BASIC.monthlyDeliveryLimit).toBe(5000);
    expect(LINE_PLANS.LINE_BASIC.overageEnabled).toBeTruthy();
    expect(LINE_PLANS.LINE_BASIC.unlimitedOptionEnabled).toBeTruthy();

    expect(LINE_PLANS.LINE_AUTO.monthlyPrice).toBe(29800);
    expect(LINE_PLANS.LINE_AUTO.monthlyDeliveryLimit).toBe(30000);
    expect(LINE_PLANS.LINE_AUTO.multiStoreEnabled).toBeTruthy();
    expect(LINE_PLANS.LINE_AUTO.overageEnabled).toBeTruthy();

    expect(UNLIMITED_DELIVERY_OPTION.monthlyPrice).toBe(9800);
    expect(UNLIMITED_DELIVERY_OPTION.eligiblePlans).toEqual(['LINE_BASIC', 'LINE_AUTO']);
  });

  test('FREEは上限超過時に配信不可にする', () => {
    const result = evaluateLineDeliveryUsage({
      planCode: 'FREE',
      usedBefore: 999,
      deliveryCount: 2,
    });

    expect(result.allowed).toBeFalsy();
    expect(result.reasonCode).toBe('free_limit_exceeded');
    expect(result.message).toContain('LINE BASIC');
    expect(result.estimatedOverageAmount).toBe(0);
  });

  test('BASIC/AUTOは上限超過時に従量課金見込みを計算する', () => {
    const basic = evaluateLineDeliveryUsage({
      planCode: 'LINE_BASIC',
      usedBefore: 4900,
      deliveryCount: 250,
    });
    const auto = evaluateLineDeliveryUsage({
      planCode: 'LINE_AUTO',
      usedBefore: 29900,
      deliveryCount: 1200,
    });

    expect(basic.allowed).toBeTruthy();
    expect(basic.overageCount).toBe(150);
    expect(basic.estimatedOverageAmount).toBe(1000);

    expect(auto.allowed).toBeTruthy();
    expect(auto.overageCount).toBe(1100);
    expect(auto.estimatedOverageAmount).toBe(2000);
  });

  test('無制限オプション中は従量課金を発生させない', () => {
    const basic = evaluateLineDeliveryUsage({
      planCode: 'LINE_BASIC',
      unlimitedDeliveryEnabled: true,
      usedBefore: 100000,
      deliveryCount: 5000,
    });
    const auto = evaluateLineDeliveryUsage({
      planCode: 'LINE_AUTO',
      unlimitedDeliveryEnabled: true,
      usedBefore: 100000,
      deliveryCount: 5000,
    });
    const free = evaluateLineDeliveryUsage({
      planCode: 'FREE',
      unlimitedDeliveryEnabled: true,
      usedBefore: 999,
      deliveryCount: 2,
    });

    expect(basic.allowed).toBeTruthy();
    expect(basic.unlimitedDeliveryEnabled).toBeTruthy();
    expect(basic.estimatedOverageAmount).toBe(0);

    expect(auto.allowed).toBeTruthy();
    expect(auto.unlimitedDeliveryEnabled).toBeTruthy();
    expect(auto.estimatedOverageAmount).toBe(0);

    expect(free.allowed).toBeFalsy();
    expect(free.unlimitedDeliveryEnabled).toBeFalsy();
  });

  test('課金ログ実装は本文・LINE userId・個人情報を保存しない', async () => {
    const source = await readFile('src/lib/billing/lineBilling.ts', 'utf8');

    expect(source).toContain('delivery_usage_logs');
    expect(source).toContain('delivery_overage_logs');
    expect(source).not.toContain('line_user_id');
    expect(source).not.toContain('message_text');
    expect(source).not.toContain('body:');
    expect(source).not.toContain('phone');
    expect(source).not.toContain('address');
  });

  test('配信APIはプラン判定と課金ログ記録を呼び出す', async () => {
    const source = await readFile('src/app/api/line/send/route.ts', 'utf8');

    expect(source).toContain('evaluateTenantLineDeliveryUsage');
    expect(source).toContain('delivery_plan_limit_exceeded');
    expect(source).toContain('recordDeliveryUsage');
    expect(source).toContain('recordDeliveryOverage');
    expect(source).toContain('billing: billingSnapshot');
  });
});
