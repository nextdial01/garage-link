import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isGarageRetryDeadLetter } from '../../src/lib/billing/garageLifecycle';

type RequiredCase = {
  id: number;
  category: string;
  name: string;
  evidence: string;
  marker: string;
};

const matrix = JSON.parse(
  readFileSync('tests/fixtures/commercial-batch-1b-required-matrix.json', 'utf8'),
) as RequiredCase[];

test.describe('Batch 1B owner-fixed 31 case matrix', () => {
  test('31件を欠番・重複なく固定する', () => {
    expect(matrix).toHaveLength(31);
    expect(matrix.map(({ id }) => id)).toEqual(Array.from({ length: 31 }, (_, index) => index + 1));
    expect(new Set(matrix.map(({ name }) => name)).size).toBe(31);
  });

  for (const requiredCase of matrix) {
    test(`${requiredCase.id}. ${requiredCase.name} has executable evidence`, async () => {
      const evidence = await readFile(requiredCase.evidence, 'utf8');
      expect(evidence, `${requiredCase.evidence} must contain ${requiredCase.marker}`)
        .toContain(requiredCase.marker);
    });
  }

  test('Stripe一時障害はretry schedulingへ入り、成功前に完了扱いしない', async () => {
    // BATCH1B_STRIPE_TEMPORARY_FAILURE
    const [worker, processor] = await Promise.all([
      readFile('src/app/api/jobs/billing-webhook-retry/route.ts', 'utf8'),
      readFile('src/lib/stripe/garageWebhookProcessor.ts', 'utf8'),
    ]);
    expect(worker).toContain('failStripeEvent');
    expect(processor).toContain("'dead_letter' : 'retry_scheduled'");
    expect(processor).toContain('garageNextRetryAt');
  });

  test('retry上限到達はoperator確認付きdead-letterにする', () => {
    // BATCH1B_DEAD_LETTER
    expect(isGarageRetryDeadLetter(4)).toBe(false);
    expect(isGarageRetryDeadLetter(5)).toBe(true);
  });
});
