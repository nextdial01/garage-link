import type { LineAdapter } from '@/lib/line/adapters/types';
import type { LineSegmentCondition, LineTenantContext } from '@/lib/line/core/types';

export async function resolveLineRecipients({
  adapter,
  context,
  condition,
}: {
  adapter: LineAdapter;
  context: LineTenantContext;
  condition: LineSegmentCondition;
}) {
  const recipients = await adapter.resolveRecipients(context, condition);
  const mixedRecipient = recipients.find(
    (recipient) => context.tenantId && recipient.tenantId && recipient.tenantId !== context.tenantId
  );

  if (mixedRecipient) {
    throw new Error('配信対象に別tenantのLINE友だちが混ざっています。');
  }

  return recipients;
}
