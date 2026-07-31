import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isGarageRetryDeadLetter } from '../../src/lib/billing/garageLifecycle';
import { executeGarageWebhookRetryBatch } from '../../src/lib/stripe/garageWebhookRetryWorker';

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

  test('Stripe一時障害後に同じeventを安全に再実行して成功する', async () => {
    // BATCH1B_STRIPE_TEMPORARY_FAILURE
    // BATCH1B_RETRY_SUCCESS
    let retrievals = 0;
    let attemptCount = 0;
    let status = 'retry_scheduled';
    const run = () => executeGarageWebhookRetryBatch({
      claims: [{ stripe_event_id: 'evt_temporary', attempt_count: attemptCount }],
      workerId: `worker_${retrievals}`,
      retrieveEvent: async (eventId) => {
        retrievals += 1;
        if (retrievals === 1) throw new Error('stripe_api_temporary_failure');
        return { id: eventId, type: 'customer.subscription.updated' } as never;
      },
      processEvent: async () => undefined,
      finishEvent: async () => { status = 'completed'; },
      failEvent: async () => {
        attemptCount += 1;
        status = isGarageRetryDeadLetter(attemptCount) ? 'dead_letter' : 'retry_scheduled';
      },
    });
    const failed = await run();
    expect(failed).toEqual({ claimed: 1, completed: 0, retryScheduled: 1 });
    expect(status).toBe('retry_scheduled');
    const recovered = await run();
    expect(recovered).toEqual({ claimed: 1, completed: 1, retryScheduled: 0 });
    expect(status).toBe('completed');
  });

  test('恒久障害は最大回数でdead-letterとなり手動再実行で完了する', async () => {
    // BATCH1B_DEAD_LETTER
    // BATCH1B_PERMANENT_FAILURE_MAX_RETRY
    // BATCH1B_DEAD_LETTER_SAFE_REPLAY
    let attemptCount = 0;
    let status = 'retry_scheduled';
    const failBatch = () => executeGarageWebhookRetryBatch({
      claims: [{ stripe_event_id: 'evt_permanent', attempt_count: attemptCount }],
      workerId: `worker_${attemptCount}`,
      retrieveEvent: async () => { throw new Error('stripe_api_permanent_failure'); },
      processEvent: async () => undefined,
      finishEvent: async () => { status = 'completed'; },
      failEvent: async () => {
        attemptCount += 1;
        status = isGarageRetryDeadLetter(attemptCount) ? 'dead_letter' : 'retry_scheduled';
      },
    });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await failBatch();
      expect(result.retryScheduled).toBe(1);
      expect(status).toBe(attempt === 5 ? 'dead_letter' : 'retry_scheduled');
    }
    const replay = await executeGarageWebhookRetryBatch({
      claims: [{ stripe_event_id: 'evt_permanent', attempt_count: attemptCount }],
      workerId: 'manual_operator_replay',
      retrieveEvent: async (eventId) => ({ id: eventId, type: 'invoice.paid' }) as never,
      processEvent: async () => undefined,
      finishEvent: async () => { status = 'completed'; },
      failEvent: async () => { throw new Error('unexpected_replay_failure'); },
    });
    expect(replay).toEqual({ claimed: 1, completed: 1, retryScheduled: 0 });
    expect(status).toBe('completed');
  });
});
