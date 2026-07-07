export type ContractAccessState = 'active' | 'cancelled_retention' | 'no_store' | 'anonymous';

export type ContractAccess = {
  state: ContractAccessState;
  storeId?: string;
  plan?: string;
  cancelledAt?: string | null;
  dataDeleteScheduledAt?: string | null;
};

const CANCELLED_ALLOWED_PATHS = [
  '/settings/billing',
  '/logout',
  '/legal/terms',
  '/legal/privacy',
  '/legal/tokusho',
];

export function isCancelledRetentionAllowedPath(pathname: string) {
  if (CANCELLED_ALLOWED_PATHS.includes(pathname)) {
    return true;
  }
  return pathname.startsWith('/legal/');
}

export function parseContractAccess(value: unknown): ContractAccess {
  if (!value || typeof value !== 'object') {
    return { state: 'active' };
  }

  const row = value as Record<string, unknown>;
  const state = row.state;

  if (
    state === 'cancelled_retention' ||
    state === 'active' ||
    state === 'no_store' ||
    state === 'anonymous'
  ) {
    return {
      state,
      storeId: typeof row.store_id === 'string' ? row.store_id : undefined,
      plan: typeof row.plan === 'string' ? row.plan : undefined,
      cancelledAt: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
      dataDeleteScheduledAt:
        typeof row.data_delete_scheduled_at === 'string' ? row.data_delete_scheduled_at : null,
    };
  }

  return { state: 'active' };
}

export function formatRetentionDeadline(isoDate: string | null | undefined) {
  if (!isoDate) {
    return '—';
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'long',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}
