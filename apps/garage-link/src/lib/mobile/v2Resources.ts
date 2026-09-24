import 'server-only';

export const V2_RESOURCES = {
  customers: {
    table: 'customers',
    fields: 'id, name, kana, phone, mobile_phone, email, address, customer_type, desired_maker, desired_model, budget_min, budget_max, desired_purchase_timing, trade_in_status, customer_status, assigned_user_name, next_action_date, memo, updated_at',
    editable: ['name', 'kana', 'phone', 'mobile_phone', 'email', 'address', 'customer_type', 'desired_maker', 'desired_model', 'budget_min', 'budget_max', 'desired_purchase_timing', 'trade_in_status', 'customer_status', 'assigned_user_name', 'next_action_date', 'memo'],
    related: [],
    search: ['name', 'phone', 'mobile_phone'],
  },
  deals: {
    table: 'deals',
    fields: 'id, customer_id, vehicle_id, deal_no, title, status, probability, source, budget, trade_in_status, loan_request, next_action_at, assigned_user_name, memo, updated_at',
    editable: ['customer_id', 'vehicle_id', 'title', 'status', 'probability', 'source', 'budget', 'trade_in_status', 'loan_request', 'next_action_at', 'assigned_user_name', 'memo'],
    related: [['customer_id', 'customers'], ['vehicle_id', 'vehicles']],
    search: ['title', 'deal_no'],
  },
  appointments: {
    table: 'appointments',
    fields: 'id, customer_id, vehicle_id, deal_id, appointment_type, scheduled_at, status, assigned_user_name, note, no_show_reason, updated_at',
    editable: ['customer_id', 'vehicle_id', 'deal_id', 'appointment_type', 'scheduled_at', 'status', 'assigned_user_name', 'note', 'no_show_reason'],
    related: [['customer_id', 'customers'], ['vehicle_id', 'vehicles'], ['deal_id', 'deals']],
    search: [],
  },
  maintenance: {
    table: 'maintenance_jobs',
    fields: 'id, customer_id, vehicle_id, job_no, job_type, status, priority, assigned_user_name, request_detail, symptoms, work_items, planned_parts, work_instruction, scheduled_in_at, scheduled_start_date, scheduled_finish_date, scheduled_delivery_at, actual_in_date, actual_finish_date, actual_delivery_date, loaner_status, labor_amount, parts_amount, inspection_amount, legal_fee_amount, additional_amount, discount_amount, estimated_total_amount, billing_amount, payment_method, estimate_confirm_status, work_memo, customer_message, updated_at',
    editable: ['customer_id', 'vehicle_id', 'job_type', 'priority', 'assigned_user_name', 'request_detail', 'symptoms', 'work_items', 'planned_parts', 'work_instruction', 'scheduled_in_at', 'scheduled_start_date', 'scheduled_finish_date', 'scheduled_delivery_at', 'actual_in_date', 'actual_finish_date', 'actual_delivery_date', 'loaner_status', 'labor_amount', 'parts_amount', 'inspection_amount', 'legal_fee_amount', 'additional_amount', 'discount_amount', 'payment_method', 'estimate_confirm_status', 'work_memo', 'customer_message'],
    related: [['customer_id', 'customers'], ['vehicle_id', 'vehicles']],
    search: ['job_no', 'request_detail'],
  },
  tradeIns: {
    table: 'trade_in_vehicles',
    fields: 'id, deal_id, customer_id, maker, model_name, grade, model_year, mileage_km, vin, registration_no, inspection_expiry_date, color, condition_status, appraisal_amount, loan_balance, trade_in_amount, memo, updated_at',
    editable: ['deal_id', 'customer_id', 'maker', 'model_name', 'grade', 'model_year', 'mileage_km', 'vin', 'registration_no', 'inspection_expiry_date', 'color', 'condition_status', 'appraisal_amount', 'loan_balance', 'trade_in_amount', 'memo'],
    related: [['deal_id', 'deals'], ['customer_id', 'customers']],
    search: ['maker', 'model_name', 'registration_no'],
  },
} as const;

export type V2Resource = keyof typeof V2_RESOURCES;
export const v2Resource = (key: string): V2Resource | null => Object.hasOwn(V2_RESOURCES, key) ? key as V2Resource : null;
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const moneyFields = new Set(['budget_min','budget_max','budget','labor_amount','parts_amount','inspection_amount','legal_fee_amount','additional_amount','discount_amount','appraisal_amount','loan_balance','trade_in_amount']);
const integerFields = new Set(['model_year','mileage_km']);
const relatedFields = new Set(['customer_id','vehicle_id','deal_id']);
const dates = new Set(['next_action_date','next_action_at','scheduled_at','scheduled_in_at','scheduled_delivery_at','scheduled_start_date','scheduled_finish_date','actual_in_date','actual_finish_date','actual_delivery_date','inspection_expiry_date']);
const options: Record<string, readonly string[]> = {
  customer_type: ['individual','corporate'],
  appointment_type: ['来店予約','試乗予約','商談予約','整備予約'],
};

export function v2Patch(resource: V2Resource, input: Record<string, unknown>) {
  const allowed = new Set<string>(V2_RESOURCES[resource].editable);
  const patch: Record<string, string | number | string[] | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'id' || key === 'idempotencyKey') continue;
    if (!allowed.has(key)) return null;
    if (value === null) { patch[key] = null; continue; }
    if (relatedFields.has(key)) { if (!uuid(value)) return null; patch[key] = value; continue; }
    if (moneyFields.has(key) || integerFields.has(key)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100_000_000) return null;
      patch[key] = value; continue;
    }
    if (key === 'work_items') {
      if (!Array.isArray(value) || value.length > 30 || !value.every((part) => typeof part === 'string' && part.length <= 160)) return null;
      patch[key] = value; continue;
    }
    if (typeof value !== 'string' || value.length > 2000) return null;
    if (dates.has(key) && Number.isNaN(Date.parse(value))) return null;
    if (options[key]?.length && !options[key].includes(value)) return null;
    if (key === 'status') {
      const statuses = resource === 'deals' ? ['新規','連絡済み','来店予定','見積済み','商談中']
        : resource === 'appointments' ? ['予約済み','確認済み','完了','キャンセル','無断キャンセル'] : [];
      if (!statuses.includes(value)) return null;
    }
    patch[key] = value.trim();
  }
  return Object.keys(patch).length ? patch : null;
}
