import type { LineRecipient, LineSegmentCondition, LineTenantContext } from '@/lib/line/core/types';

export type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: string) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  single: () => PromiseLike<{ data: unknown; error: unknown }>;
  then: PromiseLike<{ data: unknown; error: unknown }>['then'];
};

export type SupabaseLineReader = {
  from: (table: string) => QueryBuilder;
};

export interface LineAdapter {
  resolveRecipients(
    context: LineTenantContext,
    condition: LineSegmentCondition
  ): Promise<LineRecipient[]>;

  canUseFeature(
    context: LineTenantContext,
    feature: string
  ): Promise<boolean>;
}
