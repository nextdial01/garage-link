export type GarageAccessibleStore = {
  id: string;
  name: string | null;
  companyName: string | null;
  isCurrent: boolean;
};

export type GarageUiCounts = {
  vehicleAttention: number;
  dealsToday: number;
  dealsOverdue: number;
  customersToday: number;
  customersOverdue: number;
  appointmentsToday: number;
  appointmentsOpen: number;
  maintenanceToday: number;
  maintenanceOverdue: number;
  inquiryPending: number;
};

export type GarageUiContext = {
  storeId: string;
  storeLabel: string;
  role: string;
  displayName: string;
  longStayThresholdDays: number;
  onboardingCompleted: boolean;
  primaryNavigationTabs: string[] | null;
  stores: GarageAccessibleStore[];
  counts: GarageUiCounts;
};

type RawRecord = Record<string, unknown>;

const emptyCounts: GarageUiCounts = {
  vehicleAttention: 0,
  dealsToday: 0,
  dealsOverdue: 0,
  customersToday: 0,
  customersOverdue: 0,
  appointmentsToday: 0,
  appointmentsOpen: 0,
  maintenanceToday: 0,
  maintenanceOverdue: 0,
  inquiryPending: 0,
};

function asRecord(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RawRecord
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function normalizeGarageUiContext(value: unknown): GarageUiContext {
  const row = asRecord(value);
  const rawCounts = asRecord(row.counts);
  const rawStores = Array.isArray(row.stores) ? row.stores : [];

  return {
    storeId: asString(row.store_id),
    storeLabel: asString(row.store_label, '店舗').trim() || '店舗',
    role: asString(row.role, 'viewer') || 'viewer',
    displayName: asString(row.display_name),
    longStayThresholdDays: asCount(row.long_stay_threshold_days) || 90,
    onboardingCompleted: row.onboarding_completed === true,
    primaryNavigationTabs: Array.isArray(row.primary_navigation_tabs)
      ? row.primary_navigation_tabs.filter((item): item is string => typeof item === 'string')
      : null,
    stores: rawStores.map((item) => {
      const store = asRecord(item);
      return {
        id: asString(store.id),
        name: typeof store.name === 'string' ? store.name : null,
        companyName: typeof store.company_name === 'string' ? store.company_name : null,
        isCurrent: store.is_current === true,
      };
    }).filter((store) => Boolean(store.id)),
    counts: {
      ...emptyCounts,
      vehicleAttention: asCount(rawCounts.vehicle_attention),
      dealsToday: asCount(rawCounts.deals_today),
      dealsOverdue: asCount(rawCounts.deals_overdue),
      customersToday: asCount(rawCounts.customers_today),
      customersOverdue: asCount(rawCounts.customers_overdue),
      appointmentsToday: asCount(rawCounts.appointments_today),
      appointmentsOpen: asCount(rawCounts.appointments_open),
      maintenanceToday: asCount(rawCounts.maintenance_today),
      maintenanceOverdue: asCount(rawCounts.maintenance_overdue),
      inquiryPending: asCount(rawCounts.inquiry_pending),
    },
  };
}

export function createGarageUiContextCache(
  load: () => Promise<GarageUiContext>,
  ttlMs = 30_000,
  now: () => number = Date.now,
) {
  let cached: { value: GarageUiContext; expiresAt: number } | null = null;
  let pending: Promise<GarageUiContext> | null = null;

  return {
    async get(options: { force?: boolean } = {}): Promise<GarageUiContext> {
      if (!options.force && cached && cached.expiresAt > now()) return cached.value;
      if (!options.force && pending) return pending;

      pending = load()
        .then((value) => {
          cached = { value, expiresAt: now() + ttlMs };
          return value;
        })
        .finally(() => {
          pending = null;
        });

      return pending;
    },
    invalidate() {
      cached = null;
      pending = null;
    },
  };
}
