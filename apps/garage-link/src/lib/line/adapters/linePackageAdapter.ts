import type { LineRecipient, LineSegmentCondition, LineTenantContext } from '@/lib/line/core/types';
import type { LineAdapter, SupabaseLineReader } from '@/lib/line/adapters/types';

export type LinePackageFriendListItem = {
  id: string;
  displayName: string | null;
  status: string | null;
  deliveryPermission: boolean | null;
  tagCount: number;
  lastInteractionAt: string | null;
  createdAt: string | null;
};

type LinePackageFriendRow = {
  id: string;
  line_display_name: string | null;
  friend_status: string | null;
  delivery_permission: boolean | null;
  tag_names: string[] | null;
  last_interaction_at: string | null;
  created_at: string | null;
};

export class LinePackageAdapter implements LineAdapter {
  constructor(private readonly supabase?: SupabaseLineReader) {}

  async listFriends(context: LineTenantContext): Promise<LinePackageFriendListItem[]> {
    if (!this.supabase) {
      throw new Error('LINE単体パッケージadapterのデータ取得にはSupabase readerが必要です。');
    }

    const query = this.supabase
      .from('line_friends')
      .select('id, line_display_name, friend_status, delivery_permission, tag_names, last_interaction_at, created_at')
      .order('created_at', { ascending: false });

    const { data, error } = context.storeId
      ? await query.eq('store_id', context.storeId)
      : context.tenantId
        ? await query.eq('tenant_id', context.tenantId)
        : await query;

    if (error) {
      throw new Error('LINE友だち一覧の取得に失敗しました。');
    }

    const rows = Array.isArray(data) ? (data as LinePackageFriendRow[]) : [];

    return rows.map((friend) => ({
      id: friend.id,
      displayName: friend.line_display_name,
      status: friend.friend_status,
      deliveryPermission: friend.delivery_permission,
      tagCount: friend.tag_names?.length ?? 0,
      lastInteractionAt: friend.last_interaction_at,
      createdAt: friend.created_at,
    }));
  }

  async resolveRecipients(
    context: LineTenantContext,
    condition: LineSegmentCondition
  ): Promise<LineRecipient[]> {
    void context;
    void condition;
    throw new Error('LINE単体パッケージadapterの対象抽出は次フェーズで実装します。');
  }

  async canUseFeature(context: LineTenantContext, feature: string) {
    return context.features.includes(feature);
  }
}

export function createLinePackageAdapter(supabase?: SupabaseLineReader) {
  return new LinePackageAdapter(supabase);
}
