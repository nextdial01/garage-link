import "server-only";
import { createLLinkServiceClient, getCurrentLLinkCompany } from "@/lib/supabase/server";

export const segmentStatuses = ["active", "inactive"] as const;
export const segmentFields = [
  "tag_includes",
  "tag_not_includes",
  "friend_status",
  "customer_status",
  "source",
  "inquiry_type",
  "interest_category",
  "vehicle_inspection_expiry_date",
  "last_message_at",
  "last_interaction_at",
  "form_answer_exists",
  "form_answer_not_exists",
] as const;
export const segmentOperators = ["equals", "not_equals", "contains", "not_contains", "before", "after", "between", "is_empty", "is_not_empty"] as const;

export type SegmentStatus = (typeof segmentStatuses)[number];
export type SegmentField = (typeof segmentFields)[number];
export type SegmentOperator = (typeof segmentOperators)[number];

export type LLinkSegment = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: SegmentStatus | string;
  created_at: string;
  updated_at: string;
  condition_count?: number;
  target_count?: number;
};

export type LLinkSegmentCondition = {
  id: string;
  company_id: string;
  segment_id: string;
  field: SegmentField | string | null;
  condition_type: SegmentField | string | null;
  operator: SegmentOperator | string;
  value: string | null;
  value_json: { value_to?: string } | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

export type SegmentTargetFriend = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  friend_status: string;
  last_message_at: string | null;
  last_interaction_at: string | null;
  customer_status: string | null;
  source: string | null;
  inquiry_type: string | null;
  interest_category: string | null;
  vehicle_inspection_expiry_date: string | null;
  tags: { id: string; name: string }[];
};

export type SegmentResult<T = null> = {
  data: T | null;
  error: string | null;
};

type RawProfile = {
  line_friend_id: string;
  customer_status: string | null;
  source: string | null;
  inquiry_type: string | null;
  interest_category: string | null;
  vehicle_inspection_expiry_date: string | null;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function safeErrorDetail(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ? `${error.code} / ` : "";
  const message = error?.message ?? "unknown error";
  return `${code}${message}`.slice(0, 220);
}

export function segmentError(operation: string, error: { code?: string; message?: string } | string | null | undefined) {
  if (!isDevelopment()) return "保存に失敗しました";
  if (typeof error === "string") return `${operation}: ${error}`;
  if (error?.code === "42501") return `${operation}: RLS violation or permission denied (${safeErrorDetail(error)})`;
  return `${operation}: ${safeErrorDetail(error)}`;
}

export async function getCurrentCompanyId() {
  const currentCompany = await getCurrentLLinkCompany();
  return currentCompany?.companyId ?? null;
}

function normalizeField(value: string): SegmentField {
  return segmentFields.includes(value as SegmentField) ? (value as SegmentField) : "friend_status";
}

function normalizeOperator(value: string): SegmentOperator {
  return segmentOperators.includes(value as SegmentOperator) ? (value as SegmentOperator) : "equals";
}

function normalizeStatus(value: string): SegmentStatus {
  return value === "inactive" ? "inactive" : "active";
}

function conditionField(condition: LLinkSegmentCondition) {
  return normalizeField(String(condition.field ?? condition.condition_type ?? "friend_status"));
}

function compareString(actual: string | null | undefined, operator: string, expected: string | null | undefined) {
  const actualValue = actual ?? "";
  const expectedValue = expected ?? "";
  if (operator === "not_equals") return actualValue !== expectedValue;
  if (operator === "contains") return actualValue.includes(expectedValue);
  if (operator === "not_contains") return !actualValue.includes(expectedValue);
  if (operator === "is_empty") return !actualValue;
  if (operator === "is_not_empty") return Boolean(actualValue);
  return actualValue === expectedValue;
}

function compareDate(actual: string | null | undefined, operator: string, expected: string | null | undefined, expectedTo?: string | null) {
  if (operator === "is_empty") return !actual;
  if (operator === "is_not_empty") return Boolean(actual);
  if (!actual || !expected) return false;
  const actualTime = new Date(actual).getTime();
  const expectedTime = new Date(expected).getTime();
  if (!Number.isFinite(actualTime) || !Number.isFinite(expectedTime)) return false;
  if (operator === "before") return actualTime < expectedTime;
  if (operator === "after") return actualTime > expectedTime;
  if (operator === "between") {
    const toTime = new Date(expectedTo ?? "").getTime();
    if (!Number.isFinite(toTime)) return false;
    return actualTime >= expectedTime && actualTime <= toTime;
  }
  if (operator === "not_equals") return actualTime !== expectedTime;
  return actualTime === expectedTime;
}

export function matchesSegmentConditions(friend: SegmentTargetFriend, conditions: LLinkSegmentCondition[]) {
  if (conditions.length === 0) return true;

  return conditions.every((condition) => {
    const field = conditionField(condition);
    const operator = normalizeOperator(String(condition.operator ?? "equals"));
    const value = condition.value ?? "";
    const valueTo = condition.value_json?.value_to ?? null;

    if (field === "tag_includes") return friend.tags.some((tag) => tag.id === value || tag.name === value);
    if (field === "tag_not_includes") return !friend.tags.some((tag) => tag.id === value || tag.name === value);
    if (field === "friend_status") return compareString(friend.friend_status, operator, value);
    if (field === "customer_status") return compareString(friend.customer_status, operator, value);
    if (field === "source") return compareString(friend.source, operator, value);
    if (field === "inquiry_type") return compareString(friend.inquiry_type, operator, value);
    if (field === "interest_category") return compareString(friend.interest_category, operator, value);
    if (field === "vehicle_inspection_expiry_date") return compareDate(friend.vehicle_inspection_expiry_date, operator, value, valueTo);
    if (field === "last_message_at") return compareDate(friend.last_message_at, operator, value, valueTo);
    if (field === "last_interaction_at") return compareDate(friend.last_interaction_at, operator, value, valueTo);
    if (field === "form_answer_exists") return true;
    if (field === "form_answer_not_exists") return true;
    return true;
  });
}

export async function listSegmentTags() {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase || !companyId) return [];
  const { data } = await supabase.from("ll_tags").select("id, name").eq("company_id", companyId).order("name");
  return (data ?? []) as { id: string; name: string }[];
}

export async function listAllSegmentTargetFriends(): Promise<SegmentResult<SegmentTargetFriend[]>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "segment target fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "segment target fetch failed: company_id missing" };

  const { data: friends, error: friendsError } = await supabase
    .from("ll_line_friends")
    .select("id, line_user_id, display_name, friend_status, last_message_at, last_interaction_at")
    .eq("company_id", companyId)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (friendsError) return { data: null, error: segmentError("segment target fetch failed", friendsError) };

  const friendRows = (friends ?? []) as {
    id: string;
    line_user_id: string;
    display_name: string | null;
    friend_status: string;
    last_message_at: string | null;
    last_interaction_at: string | null;
  }[];
  const ids = friendRows.map((friend) => friend.id);
  if (ids.length === 0) return { data: [], error: null };

  const [{ data: profiles }, { data: tagRows }] = await Promise.all([
    supabase
      .from("ll_friend_profiles")
      .select("line_friend_id, customer_status, source, inquiry_type, interest_category, vehicle_inspection_expiry_date")
      .eq("company_id", companyId)
      .in("line_friend_id", ids),
    supabase
      .from("ll_friend_tags")
      .select("line_friend_id, ll_tags(id, name)")
      .eq("company_id", companyId)
      .in("line_friend_id", ids),
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [(profile as RawProfile).line_friend_id, profile as RawProfile]));
  const tagsMap = new Map<string, { id: string; name: string }[]>();
  for (const row of (tagRows ?? []) as unknown as { line_friend_id: string; ll_tags: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const relatedTags = Array.isArray(row.ll_tags) ? row.ll_tags : row.ll_tags ? [row.ll_tags] : [];
    if (relatedTags.length === 0) continue;
    tagsMap.set(row.line_friend_id, [...(tagsMap.get(row.line_friend_id) ?? []), ...relatedTags]);
  }

  return {
    data: friendRows.map((friend) => {
      const profile = profileMap.get(friend.id);
      return {
        ...friend,
        customer_status: profile?.customer_status ?? null,
        source: profile?.source ?? null,
        inquiry_type: profile?.inquiry_type ?? null,
        interest_category: profile?.interest_category ?? null,
        vehicle_inspection_expiry_date: profile?.vehicle_inspection_expiry_date ?? null,
        tags: tagsMap.get(friend.id) ?? [],
      };
    }),
    error: null,
  };
}

export async function listSegments(): Promise<SegmentResult<LLinkSegment[]>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "segments fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "segments fetch failed: company_id missing" };

  const { data: segments, error } = await supabase
    .from("ll_segments")
    .select("id, company_id, name, description, status, created_at, updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error) return { data: null, error: segmentError("segments fetch failed", error) };

  const segmentRows = (segments ?? []) as LLinkSegment[];
  const ids = segmentRows.map((segment) => segment.id);
  const conditionMap = new Map<string, LLinkSegmentCondition[]>();
  if (ids.length > 0) {
    const { data: conditions } = await supabase
      .from("ll_segment_conditions")
      .select("id, company_id, segment_id, field, condition_type, operator, value, value_json, sort_order, created_at, updated_at")
      .eq("company_id", companyId)
      .in("segment_id", ids);
    for (const condition of (conditions ?? []) as LLinkSegmentCondition[]) {
      conditionMap.set(condition.segment_id, [...(conditionMap.get(condition.segment_id) ?? []), condition]);
    }
  }

  const targetResult = await listAllSegmentTargetFriends();
  const allFriends = targetResult.data ?? [];

  return {
    data: segmentRows.map((segment) => {
      const conditions = conditionMap.get(segment.id) ?? [];
      return {
        ...segment,
        condition_count: conditions.length,
        target_count: allFriends.filter((friend) => matchesSegmentConditions(friend, conditions)).length,
      };
    }),
    error: targetResult.error,
  };
}

export async function getSegment(id: string): Promise<SegmentResult<{ segment: LLinkSegment; conditions: LLinkSegmentCondition[]; targets: SegmentTargetFriend[]; tags: { id: string; name: string }[] }>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "segment fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "segment fetch failed: company_id missing" };

  const { data: segment, error } = await supabase
    .from("ll_segments")
    .select("id, company_id, name, description, status, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error: segmentError("segment fetch failed", error) };
  if (!segment) return { data: null, error: "segment not found" };

  const { data: conditions, error: conditionError } = await supabase
    .from("ll_segment_conditions")
    .select("id, company_id, segment_id, field, condition_type, operator, value, value_json, sort_order, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("segment_id", id)
    .order("sort_order", { ascending: true });
  if (conditionError) return { data: null, error: segmentError("segment conditions fetch failed", conditionError) };

  const allTargets = await listAllSegmentTargetFriends();
  if (!allTargets.data) return { data: null, error: allTargets.error };
  const conditionRows = (conditions ?? []) as LLinkSegmentCondition[];
  const tags = await listSegmentTags();

  return {
    data: {
      segment: segment as LLinkSegment,
      conditions: conditionRows,
      targets: allTargets.data.filter((friend) => matchesSegmentConditions(friend, conditionRows)),
      tags,
    },
    error: null,
  };
}

function conditionRowsFromForm(companyId: string, segmentId: string, formData: FormData) {
  return Array.from({ length: 8 }, (_, index) => {
    const fieldValue = String(formData.get(`condition_field_${index}`) ?? "").trim();
    if (!fieldValue) return null;
    const field = normalizeField(fieldValue);
    const valueTo = String(formData.get(`condition_value_to_${index}`) ?? "").trim();
    return {
      company_id: companyId,
      segment_id: segmentId,
      field,
      condition_type: field,
      operator: normalizeOperator(String(formData.get(`condition_operator_${index}`) ?? "equals")),
      value: String(formData.get(`condition_value_${index}`) ?? "").trim(),
      value_json: valueTo ? { value_to: valueTo } : {},
      sort_order: index,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function createSegmentFromFormData(formData: FormData): Promise<SegmentResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "segment save failed: service role key missing" };
  if (!companyId) return { data: null, error: "segment save failed: company_id missing" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { data: null, error: "segment save failed: name missing" };

  const { data, error } = await supabase
    .from("ll_segments")
    .insert({
      company_id: companyId,
      name,
      description: String(formData.get("description") ?? "").trim(),
      status: normalizeStatus(String(formData.get("status") ?? "active")),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { data: null, error: segmentError("segment save failed", error) };

  const segmentId = (data as { id: string }).id;
  const rows = conditionRowsFromForm(companyId, segmentId, formData);
  if (rows.length > 0) {
    const { error: conditionError } = await supabase.from("ll_segment_conditions").insert(rows);
    if (conditionError) return { data: null, error: segmentError("segment conditions save failed", conditionError) };
  }
  return { data: segmentId, error: null };
}

export async function updateSegmentFromFormData(segmentId: string, formData: FormData): Promise<SegmentResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "segment update failed: service role key missing" };
  if (!companyId) return { data: null, error: "segment update failed: company_id missing" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { data: null, error: "segment update failed: name missing" };

  const { error } = await supabase
    .from("ll_segments")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim(),
      status: normalizeStatus(String(formData.get("status") ?? "active")),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("id", segmentId);
  if (error) return { data: null, error: segmentError("segment update failed", error) };

  const { error: deleteError } = await supabase.from("ll_segment_conditions").delete().eq("company_id", companyId).eq("segment_id", segmentId);
  if (deleteError) return { data: null, error: segmentError("segment conditions replace failed", deleteError) };

  const rows = conditionRowsFromForm(companyId, segmentId, formData);
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("ll_segment_conditions").insert(rows);
    if (insertError) return { data: null, error: segmentError("segment conditions save failed", insertError) };
  }
  return { data: segmentId, error: null };
}
