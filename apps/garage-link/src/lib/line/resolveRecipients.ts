import { sha256Hex } from '@/lib/security/hash';
import { createGarageLinkLineAdapter } from '@/lib/line/adapters/garageLinkAdapter';
import { resolveLineRecipients } from '@/lib/line/core/recipients';
import type { SupabaseLineReader } from '@/lib/line/adapters/types';

export type LineDraftForDelivery = {
  id: string;
  tenant_id: string | null;
  store_id: string;
  customer_id: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  title: string | null;
  body: string | null;
};

export type ResolvedLineRecipient = {
  lineUserId: string;
  lineDisplayName: string | null;
};

export type ResolvedDraftDelivery = {
  tenantId: string | null;
  recipients: ResolvedLineRecipient[];
  targetConditionSnapshot: {
    delivery_type: 'single_draft';
    source: 'line_message_draft';
    draft_id: string;
    customer_id: string | null;
    target_count: number;
  };
  messageSnapshot: {
    message_type: 'text';
    title: string | null;
    body_hash: string;
    body_length: number;
  };
};

export async function resolveDraftRecipients({
  supabase,
  draft,
}: {
  supabase: SupabaseLineReader;
  draft: LineDraftForDelivery;
}): Promise<ResolvedDraftDelivery> {
  if (!draft.body?.trim()) {
    throw new Error('メッセージ本文が空です。');
  }

  if (!draft.line_user_id) {
    throw new Error('LINEユーザーIDが未設定です。');
  }
  const lineUserId = draft.line_user_id;

  const adapter = createGarageLinkLineAdapter(supabase);
  const context = await adapter.createContextFromDraft({ draft });
  const recipients = await resolveLineRecipients({
    adapter,
    context,
    condition: {
      type: 'single_draft',
      draftId: draft.id,
      customerId: draft.customer_id,
      lineUserId,
    },
  });

  return {
    tenantId: context.tenantId,
    recipients: recipients.map((recipient) => ({
      lineUserId: recipient.lineUserId ?? lineUserId,
      lineDisplayName: recipient.displayName ?? draft.line_display_name,
    })),
    targetConditionSnapshot: {
      delivery_type: 'single_draft',
      source: 'line_message_draft',
      draft_id: draft.id,
      customer_id: draft.customer_id,
      target_count: 1,
    },
    messageSnapshot: {
      message_type: 'text',
      title: draft.title,
      body_hash: sha256Hex(draft.body.trim()),
      body_length: draft.body.trim().length,
    },
  };
}
