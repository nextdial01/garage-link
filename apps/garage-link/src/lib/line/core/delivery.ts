import type { LineRecipient, LineTenantContext } from '@/lib/line/core/types';
import {
  assertTargetCountIsSafe,
  canExecuteLineDelivery,
  canTestLineDelivery,
  needsTargetReconfirmation,
} from '@/lib/line/validateDelivery';

export function assertRecipientsStayInTenant({
  context,
  recipients,
}: {
  context: LineTenantContext;
  recipients: LineRecipient[];
}) {
  if (!context.tenantId) return;

  const mixedRecipient = recipients.find((recipient) => recipient.tenantId && recipient.tenantId !== context.tenantId);
  if (mixedRecipient) {
    throw new Error('配信対象に別tenantのLINE友だちが混ざっています。');
  }
}

export function validateLineDeliveryRequest({
  context,
  recipients,
  snapshotCount,
  deliveryType,
}: {
  context: LineTenantContext;
  recipients: LineRecipient[];
  snapshotCount?: number | null;
  deliveryType: 'test' | 'confirm' | 'send' | 'scheduled';
}) {
  assertRecipientsStayInTenant({ context, recipients });
  assertTargetCountIsSafe(recipients.length);

  if ((deliveryType === 'send' || deliveryType === 'scheduled') && !canExecuteLineDelivery(context.role)) {
    throw new Error('本配信を実行する権限がありません。');
  }

  if (deliveryType === 'test' && !canTestLineDelivery(context.role)) {
    throw new Error('テスト配信を実行する権限がありません。');
  }

  if (deliveryType === 'send' && needsTargetReconfirmation(snapshotCount, recipients.length)) {
    throw new Error('配信対象人数が変わっています。再度配信前確認を実行してください。');
  }
}
