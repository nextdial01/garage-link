// GARAGE LINK → L-LINK 配信候補（配信下書き）連携の共有契約。
// 重要: GARAGE LINK は配信候補を「渡す」だけ。実際のLINE送信は L-LINK の責務であり、
// この層から LINE Messaging API を呼ぶことは禁止（送信処理を一切含めない）。

// 037 で許可する配信候補イベント種別。
export const CANDIDATE_EVENT_TYPES = [
  'inspection_reminder',
  'periodic_inspection',
  'post_delivery_follow_up',
  'long_no_contact',
  'repurchase',
  'review_request',
] as const;
export type CandidateEventType = (typeof CANDIDATE_EVENT_TYPES)[number];

export const CANDIDATE_EVENT_TYPE_LABELS: Record<CandidateEventType, string> = {
  inspection_reminder: '車検案内',
  periodic_inspection: '点検案内',
  post_delivery_follow_up: '納車後フォロー',
  long_no_contact: '長期未接触',
  repurchase: '買替提案',
  review_request: '口コミ依頼',
};

// L-LINK へ渡す配信下書き1件分の契約（PII最小化: line_user_id 等は渡さず customer_id で解決）。
export type DeliveryCandidate = {
  event_id: string;
  company_id: string | null;
  store_id: string;
  customer_id: string | null;
  event_type: CandidateEventType;
  reminder_offset_days: number;
  reference_date: string; // 判定基準日（車検満了日・納車日など種別により意味が異なる）
  customer_name: string | null;
  vehicle_name: string | null;
  created_at: string;
};

// L-LINK へ渡す配信下書きバッチの契約。
export type DeliveryDraftBatch = {
  store_id: string;
  total: number;
  candidates: DeliveryCandidate[];
};
