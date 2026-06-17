import { createLineTenantContext } from '@/lib/line/core/context';
import type { LineRecipient, LineSegmentCondition, LineTenantContext } from '@/lib/line/core/types';
import type { LineAdapter, SupabaseLineReader } from '@/lib/line/adapters/types';

type CustomerStoreRow = {
  id: string;
  store_id: string;
};

type StoreTenantRow = {
  id: string;
  tenant_id: string | null;
};

type LineFriendRow = {
  id: string;
  tenant_id: string | null;
  store_id: string;
  line_user_id: string;
  line_display_name: string | null;
  friend_status: string | null;
  delivery_permission: boolean | null;
};

export type GarageLinkDraftRecipientSource = {
  id: string;
  tenant_id: string | null;
  store_id: string;
  customer_id: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
};

async function resolveStoreTenant({
  supabase,
  storeId,
}: {
  supabase: SupabaseLineReader;
  storeId: string;
}) {
  const { data: storeData } = await supabase
    .from('stores')
    .select('id, tenant_id')
    .eq('id', storeId)
    .single();

  return storeData as StoreTenantRow | null;
}

async function assertCustomerBelongsToStore({
  supabase,
  customerId,
  storeId,
}: {
  supabase: SupabaseLineReader;
  customerId: string | null;
  storeId: string;
}) {
  if (!customerId) return;

  const { data: customerData } = await supabase
    .from('customers')
    .select('id, store_id')
    .eq('id', customerId)
    .single();
  const customer = customerData as CustomerStoreRow | null;

  if (!customer || customer.store_id !== storeId) {
    throw new Error('配信対象の顧客が別店舗に紐づいている可能性があります。');
  }
}

export class GarageLinkLineAdapter implements LineAdapter {
  constructor(private readonly supabase: SupabaseLineReader) {}

  async createContextFromDraft({
    draft,
    role = 'viewer',
    features = ['line'],
  }: {
    draft: GarageLinkDraftRecipientSource;
    role?: string | null;
    features?: string[];
  }): Promise<LineTenantContext> {
    const store = await resolveStoreTenant({ supabase: this.supabase, storeId: draft.store_id });

    return createLineTenantContext({
      tenantId: draft.tenant_id ?? store?.tenant_id ?? null,
      storeId: draft.store_id,
      features,
      role,
    });
  }

  async resolveRecipients(
    context: LineTenantContext,
    condition: LineSegmentCondition
  ): Promise<LineRecipient[]> {
    if (condition.type !== 'single_draft') {
      throw new Error('GARAGE LINK adapter currently supports single draft delivery only.');
    }

    if (!context.storeId) {
      throw new Error('GARAGE LINK adapter requires storeId.');
    }

    if (!condition.lineUserId) {
      throw new Error('LINEユーザーIDが未設定です。');
    }

    await assertCustomerBelongsToStore({
      supabase: this.supabase,
      customerId: condition.customerId ?? null,
      storeId: context.storeId,
    });

    const { data: friendData } = await this.supabase
      .from('line_friends')
      .select('id, tenant_id, store_id, line_user_id, line_display_name, friend_status, delivery_permission')
      .eq('store_id', context.storeId)
      .eq('line_user_id', condition.lineUserId)
      .single();
    const friend = friendData as LineFriendRow | null;

    if (!friend || friend.store_id !== context.storeId) {
      throw new Error('配信対象のLINE友だちが所属店舗に紐づいていません。');
    }

    if (context.tenantId && friend.tenant_id && friend.tenant_id !== context.tenantId) {
      throw new Error('配信対象に別tenantのLINE友だちが混ざっています。');
    }

    if (friend.friend_status === 'blocked' || friend.delivery_permission === false) {
      throw new Error('配信対象がブロック中、または配信不許可です。');
    }

    return [
      {
        lineFriendId: friend.id,
        lineUserId: condition.lineUserId,
        displayName: friend.line_display_name,
        tenantId: friend.tenant_id ?? context.tenantId,
        storeId: friend.store_id,
      },
    ];
  }

  async canUseFeature(context: LineTenantContext, feature: string) {
    return context.features.includes(feature);
  }
}

export function createGarageLinkLineAdapter(supabase: SupabaseLineReader) {
  return new GarageLinkLineAdapter(supabase);
}
