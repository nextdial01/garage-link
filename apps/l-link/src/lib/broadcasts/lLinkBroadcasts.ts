import "server-only";
import { createLLinkServiceClient } from "@/lib/supabase/server";
import {
  getCurrentCompanyId,
  getSegment,
  listAllSegmentTargetFriends,
  listSegmentTags,
  matchesSegmentConditions,
  type SegmentTargetFriend,
} from "@/lib/segments/lLinkSegments";

export const broadcastStatuses = ["draft", "scheduled", "ready", "sent", "canceled"] as const;
export const broadcastTargetTypes = ["all", "tag", "segment"] as const;

export type BroadcastStatus = (typeof broadcastStatuses)[number];
export type BroadcastTargetType = (typeof broadcastTargetTypes)[number];

export type LLinkBroadcast = {
  id: string;
  company_id: string;
  line_account_id: string | null;
  name: string | null;
  title: string | null;
  message_text: string | null;
  message_body: string | null;
  target_type: BroadcastTargetType | string;
  target_tag_ids: string[] | null;
  target_segment_id: string | null;
  scheduled_at: string | null;
  status: BroadcastStatus | string;
  target_count: number;
  created_at: string;
  updated_at: string;
};

export type LLinkBroadcastTarget = {
  id: string;
  company_id: string;
  broadcast_id: string;
  line_friend_id: string | null;
  line_user_id: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
};

export type BroadcastResult<T = null> = {
  data: T | null;
  error: string | null;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function safeErrorDetail(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ? `${error.code} / ` : "";
  const message = error?.message ?? "unknown error";
  return `${code}${message}`.slice(0, 220);
}

export function broadcastError(operation: string, error: { code?: string; message?: string } | string | null | undefined) {
  if (!isDevelopment()) return "保存に失敗しました";
  if (typeof error === "string") return `${operation}: ${error}`;
  if (error?.code === "42501") return `${operation}: RLS violation or permission denied (${safeErrorDetail(error)})`;
  return `${operation}: ${safeErrorDetail(error)}`;
}

function normalizeStatus(value: string): BroadcastStatus {
  return broadcastStatuses.includes(value as BroadcastStatus) ? (value as BroadcastStatus) : "draft";
}

function normalizeTargetType(value: string): BroadcastTargetType {
  return broadcastTargetTypes.includes(value as BroadcastTargetType) ? (value as BroadcastTargetType) : "all";
}

export async function resolveBroadcastTargets(input: {
  targetType: BroadcastTargetType | string;
  targetTagIds?: string[];
  targetSegmentId?: string | null;
}): Promise<BroadcastResult<SegmentTargetFriend[]>> {
  const allFriends = await listAllSegmentTargetFriends();
  if (!allFriends.data) return { data: null, error: allFriends.error };

  const targetType = normalizeTargetType(String(input.targetType));
  if (targetType === "all") return { data: allFriends.data, error: null };
  if (targetType === "tag") {
    const tagIds = new Set((input.targetTagIds ?? []).filter(Boolean));
    return {
      data: allFriends.data.filter((friend) => friend.tags.some((tag) => tagIds.has(tag.id))),
      error: null,
    };
  }
  if (targetType === "segment" && input.targetSegmentId) {
    const segment = await getSegment(input.targetSegmentId);
    const segmentData = segment.data;
    if (!segmentData) return { data: null, error: segment.error ?? "broadcast target preview failed: segment not found" };
    return {
      data: allFriends.data.filter((friend) => matchesSegmentConditions(friend, segmentData.conditions)),
      error: null,
    };
  }
  return { data: [], error: null };
}

export async function listBroadcasts(): Promise<BroadcastResult<LLinkBroadcast[]>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "broadcasts fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "broadcasts fetch failed: company_id missing" };

  const { data, error } = await supabase
    .from("ll_broadcasts")
    .select("id, company_id, line_account_id, name, title, message_text, message_body, target_type, target_tag_ids, target_segment_id, scheduled_at, status, target_count, created_at, updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  if (error) return { data: null, error: broadcastError("broadcasts fetch failed", error) };
  return { data: (data ?? []) as LLinkBroadcast[], error: null };
}

export async function listBroadcastFormOptions() {
  const [tags, segments] = await Promise.all([listSegmentTags(), import("@/lib/segments/lLinkSegments").then((module) => module.listSegments())]);
  return { tags, segments: segments.data ?? [], error: segments.error };
}

export async function getBroadcast(id: string): Promise<BroadcastResult<{ broadcast: LLinkBroadcast; targets: SegmentTargetFriend[]; savedTargets: LLinkBroadcastTarget[] }>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "broadcast fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "broadcast fetch failed: company_id missing" };

  const { data, error } = await supabase
    .from("ll_broadcasts")
    .select("id, company_id, line_account_id, name, title, message_text, message_body, target_type, target_tag_ids, target_segment_id, scheduled_at, status, target_count, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error: broadcastError("broadcast fetch failed", error) };
  if (!data) return { data: null, error: "broadcast not found" };

  const broadcast = data as LLinkBroadcast;
  const targets = await resolveBroadcastTargets({
    targetType: broadcast.target_type,
    targetTagIds: broadcast.target_tag_ids ?? [],
    targetSegmentId: broadcast.target_segment_id,
  });
  if (!targets.data) return { data: null, error: targets.error };

  const { data: savedTargets } = await supabase
    .from("ll_broadcast_targets")
    .select("id, company_id, broadcast_id, line_friend_id, line_user_id, status, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("broadcast_id", id)
    .order("created_at", { ascending: false });

  return {
    data: {
      broadcast,
      targets: targets.data,
      savedTargets: (savedTargets ?? []) as LLinkBroadcastTarget[],
    },
    error: null,
  };
}

function scheduledAtFromForm(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw).toISOString() : null;
}

async function replaceBroadcastTargets(
  supabase: NonNullable<ReturnType<typeof createLLinkServiceClient>>,
  companyId: string,
  broadcastId: string,
  targets: SegmentTargetFriend[],
) {
  const { error: deleteError } = await supabase.from("ll_broadcast_targets").delete().eq("company_id", companyId).eq("broadcast_id", broadcastId);
  if (deleteError) return deleteError;
  if (targets.length === 0) return null;

  const { error } = await supabase.from("ll_broadcast_targets").insert(
    targets.map((friend) => ({
      company_id: companyId,
      broadcast_id: broadcastId,
      line_friend_id: friend.id,
      line_user_id: friend.line_user_id,
      status: "preview",
      target_snapshot: {
        display_name: friend.display_name,
        friend_status: friend.friend_status,
        tag_count: friend.tags.length,
      },
      target_count: 1,
    })),
  );
  return error;
}

export async function createBroadcastFromFormData(formData: FormData): Promise<BroadcastResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "broadcast save failed: service role key missing" };
  if (!companyId) return { data: null, error: "broadcast save failed: company_id missing" };

  const name = String(formData.get("name") ?? "").trim();
  const messageText = String(formData.get("message_text") ?? "").trim();
  if (!name) return { data: null, error: "broadcast save failed: name missing" };
  if (!messageText) return { data: null, error: "broadcast save failed: message missing" };

  const targetType = normalizeTargetType(String(formData.get("target_type") ?? "all"));
  const targetTagIds = formData.getAll("target_tag_ids").map(String).filter(Boolean);
  const targetSegmentId = String(formData.get("target_segment_id") ?? "").trim() || null;
  const targets = await resolveBroadcastTargets({ targetType, targetTagIds, targetSegmentId });
  if (!targets.data) return { data: null, error: targets.error };

  const { data, error } = await supabase
    .from("ll_broadcasts")
    .insert({
      company_id: companyId,
      name,
      title: name,
      message_text: messageText,
      message_body: messageText,
      message_type: "text",
      target_type: targetType,
      target_tag_ids: targetTagIds,
      target_segment_id: targetType === "segment" ? targetSegmentId : null,
      scheduled_at: scheduledAtFromForm(formData.get("scheduled_at")),
      status: normalizeStatus(String(formData.get("status") ?? "draft")),
      target_count: targets.data.length,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { data: null, error: broadcastError("broadcast save failed", error) };

  const broadcastId = (data as { id: string }).id;
  const targetError = await replaceBroadcastTargets(supabase, companyId, broadcastId, targets.data);
  if (targetError) return { data: null, error: broadcastError("broadcast targets save failed", targetError) };
  return { data: broadcastId, error: null };
}
