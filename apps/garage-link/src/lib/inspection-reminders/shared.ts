// 車検案内設定の共有型・バリデーション。サーバー/クライアント双方で利用します。

export type ReminderTiming = {
  offset_days: number;
  enabled: boolean;
};

export type ReminderSettings = {
  enabled: boolean;
  exclude_sold: boolean;
  exclude_scrapped: boolean;
  exclude_reserved_or_in_service: boolean;
  require_customer_link: boolean;
  timings: ReminderTiming[];
};

export const MIN_OFFSET_DAYS = 1;
export const MAX_OFFSET_DAYS = 365;
export const DEFAULT_TIMINGS: ReminderTiming[] = [
  { offset_days: 90, enabled: true },
  { offset_days: 60, enabled: true },
  { offset_days: 30, enabled: true },
];

export const REMINDER_STATUSES = ['pending', 'processing', 'completed', 'skipped', 'failed'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  pending: '連携待ち',
  processing: '処理中',
  completed: '完了',
  skipped: '対象外',
  failed: '失敗',
};

export function isValidOffsetDays(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_OFFSET_DAYS &&
    value <= MAX_OFFSET_DAYS
  );
}

// タイミング配列を検証し、正規化（昇順・重複排除）した結果かエラーメッセージを返す。
export type EligibilityVehicleCounts = {
  total: number;
  no_expiry_date: number;
  in_window: number;
  /** Vehicles satisfying all exclusion conditions today. Does NOT subtract existing events. */
  match_vehicle_conditions_today: number;
  /** Subset of match_vehicle_conditions_today with no idempotency-key collision. Actual new inserts if cron ran today. */
  new_events_creatable_today: number;
  excluded_sold: number;
  excluded_scrapped: number;
  excluded_reserved: number;
  no_customer_link: number;
};

export type EligibilitySummary = {
  today: string;
  cfg_enabled: boolean;
  enabled_offsets: number[];
  vehicles: EligibilityVehicleCounts;
  events_by_status: Record<string, number>;
};

export function validateTimings(
  timings: ReminderTiming[]
): { ok: true; timings: ReminderTiming[] } | { ok: false; error: string } {
  const seen = new Set<number>();
  for (const timing of timings) {
    if (!isValidOffsetDays(timing.offset_days)) {
      return { ok: false, error: `案内タイミングは${MIN_OFFSET_DAYS}〜${MAX_OFFSET_DAYS}の整数で入力してください。` };
    }
    if (seen.has(timing.offset_days)) {
      return { ok: false, error: `同じ日数（${timing.offset_days}日前）は重複登録できません。` };
    }
    seen.add(timing.offset_days);
  }
  const normalized = [...timings].sort((a, b) => a.offset_days - b.offset_days);
  return { ok: true, timings: normalized };
}
