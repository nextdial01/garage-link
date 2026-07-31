import type Stripe from 'stripe';

export type GarageWebhookRetryClaim = {
  stripe_event_id: string;
  attempt_count: number;
};

export type GarageWebhookRetryBatchResult = {
  claimed: number;
  completed: number;
  retryScheduled: number;
};

export async function executeGarageWebhookRetryBatch(input: {
  claims: GarageWebhookRetryClaim[];
  workerId: string;
  retrieveEvent: (eventId: string) => Promise<Stripe.Event>;
  processEvent: (event: Stripe.Event) => Promise<void>;
  finishEvent: (eventId: string, workerId: string) => Promise<void>;
  failEvent: (eventId: string, workerId: string, error: unknown) => Promise<void>;
}): Promise<GarageWebhookRetryBatchResult> {
  let completed = 0;
  let retryScheduled = 0;
  for (const claim of input.claims) {
    try {
      const event = await input.retrieveEvent(claim.stripe_event_id);
      await input.processEvent(event);
      await input.finishEvent(event.id, input.workerId);
      completed += 1;
    } catch (error) {
      await input.failEvent(claim.stripe_event_id, input.workerId, error);
      retryScheduled += 1;
    }
  }
  return { claimed: input.claims.length, completed, retryScheduled };
}
