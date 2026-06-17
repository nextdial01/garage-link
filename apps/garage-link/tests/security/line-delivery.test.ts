import { expect, test } from '@playwright/test';
import {
  LINE_IMMEDIATE_DELIVERY_LIMIT,
  assertTargetCountIsSafe,
  canExecuteLineDelivery,
  canTestLineDelivery,
  needsTargetReconfirmation,
} from '../../src/lib/line/validateDelivery';

test.describe('LINE delivery safety', () => {
  test('本配信はowner/adminだけ許可する', () => {
    expect(canExecuteLineDelivery('owner')).toBeTruthy();
    expect(canExecuteLineDelivery('admin')).toBeTruthy();
    expect(canExecuteLineDelivery('staff')).toBeFalsy();
    expect(canExecuteLineDelivery('viewer')).toBeFalsy();
    expect(canExecuteLineDelivery('implementer')).toBeFalsy();
  });

  test('テスト配信はstaffまで許可しviewerは不可にする', () => {
    expect(canTestLineDelivery('owner')).toBeTruthy();
    expect(canTestLineDelivery('admin')).toBeTruthy();
    expect(canTestLineDelivery('staff')).toBeTruthy();
    expect(canTestLineDelivery('viewer')).toBeFalsy();
  });

  test('対象人数なし・即時配信上限超過を拒否する', () => {
    expect(() => assertTargetCountIsSafe(0)).toThrow('配信対象がありません');
    expect(() => assertTargetCountIsSafe(LINE_IMMEDIATE_DELIVERY_LIMIT + 1)).toThrow('即時配信の上限');
    expect(() => assertTargetCountIsSafe(LINE_IMMEDIATE_DELIVERY_LIMIT)).not.toThrow();
  });

  test('確認時と実行時の対象人数差が大きい場合は再確認にする', () => {
    expect(needsTargetReconfirmation(null, 10)).toBeTruthy();
    expect(needsTargetReconfirmation(120, 125)).toBeFalsy();
    expect(needsTargetReconfirmation(120, 250)).toBeTruthy();
  });
});
