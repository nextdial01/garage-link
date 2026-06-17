import "server-only";
import { createLLinkServiceClient, getCurrentLLinkCompany } from "@/lib/supabase/server";

export const richMenuSizes = {
  large: { label: "大: 2500 x 1686", width: 2500, height: 1686 },
  small: { label: "小: 2500 x 843", width: 2500, height: 843 },
} as const;

export const richMenuStatuses = ["draft", "active", "inactive"] as const;
export const richMenuActionTypes = ["uri", "message", "form", "tel", "none"] as const;

export type RichMenuSizeType = keyof typeof richMenuSizes;
export type RichMenuStatus = (typeof richMenuStatuses)[number];
export type RichMenuActionType = (typeof richMenuActionTypes)[number];

export type LLinkRichMenu = {
  id: string;
  company_id: string;
  line_account_id: string | null;
  name: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  image_path: string | null;
  size_type: RichMenuSizeType | string;
  width: number;
  height: number;
  status: RichMenuStatus | string;
  is_default: boolean;
  target_memo: string | null;
  line_rich_menu_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  area_count?: number;
};

export type LLinkRichMenuArea = {
  id: string;
  company_id: string;
  rich_menu_id: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  action_type: RichMenuActionType | string | null;
  action_value: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

export type RichMenuForm = {
  id: string;
  title: string;
  is_public: boolean;
};

export type RichMenuResult<T = null> = {
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

export function richMenuError(operation: string, error: { code?: string; message?: string } | string | null | undefined) {
  if (!isDevelopment()) return "保存に失敗しました";
  if (typeof error === "string") return `${operation}: ${error}`;
  if (error?.code === "42501") return `${operation}: RLS violation or permission denied (${safeErrorDetail(error)})`;
  return `${operation}: ${safeErrorDetail(error)}`;
}

async function getCurrentCompanyId() {
  const currentCompany = await getCurrentLLinkCompany();
  return currentCompany?.companyId ?? null;
}

function normalizeSizeType(value: string): RichMenuSizeType {
  return value === "small" ? "small" : "large";
}

function normalizeStatus(value: string): RichMenuStatus {
  return richMenuStatuses.includes(value as RichMenuStatus) ? (value as RichMenuStatus) : "draft";
}

function normalizeActionType(value: string): RichMenuActionType {
  return richMenuActionTypes.includes(value as RichMenuActionType) ? (value as RichMenuActionType) : "none";
}

function toInt(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export function publicFormUrl(formId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  return `${baseUrl.replace(/\/$/, "")}/f/${formId}`;
}

export async function listRichMenus(): Promise<RichMenuResult<LLinkRichMenu[]>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "rich menus fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "rich menus fetch failed: company_id missing" };

  const { data, error } = await supabase
    .from("ll_rich_menus")
    .select("id, company_id, line_account_id, name, title, description, image_url, image_path, size_type, width, height, status, is_default, target_memo, line_rich_menu_id, published_at, created_at, updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });

  if (error) return { data: null, error: richMenuError("rich menus fetch failed", error) };

  const menus = (data ?? []) as LLinkRichMenu[];
  const ids = menus.map((menu) => menu.id);
  const countMap = new Map<string, number>();

  if (ids.length > 0) {
    const { data: areas } = await supabase.from("ll_rich_menu_areas").select("rich_menu_id").eq("company_id", companyId).in("rich_menu_id", ids);
    for (const area of (areas ?? []) as { rich_menu_id: string }[]) {
      countMap.set(area.rich_menu_id, (countMap.get(area.rich_menu_id) ?? 0) + 1);
    }
  }

  return { data: menus.map((menu) => ({ ...menu, area_count: countMap.get(menu.id) ?? 0 })), error: null };
}

export async function listRichMenuForms(): Promise<RichMenuResult<RichMenuForm[]>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "forms fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "forms fetch failed: company_id missing" };

  const { data, error } = await supabase
    .from("ll_forms")
    .select("id, title, is_public")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: richMenuError("forms fetch failed", error) };
  return { data: (data ?? []) as RichMenuForm[], error: null };
}

export async function getRichMenu(id: string): Promise<RichMenuResult<{ menu: LLinkRichMenu; areas: LLinkRichMenuArea[]; forms: RichMenuForm[] }>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "rich menu fetch failed: service role key missing" };
  if (!companyId) return { data: null, error: "rich menu fetch failed: company_id missing" };

  const { data: menu, error } = await supabase
    .from("ll_rich_menus")
    .select("id, company_id, line_account_id, name, title, description, image_url, image_path, size_type, width, height, status, is_default, target_memo, line_rich_menu_id, published_at, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: richMenuError("rich menu fetch failed", error) };
  if (!menu) return { data: null, error: "rich menu not found" };

  const { data: areas, error: areasError } = await supabase
    .from("ll_rich_menu_areas")
    .select("id, company_id, rich_menu_id, label, x, y, width, height, action_type, action_value, sort_order, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("rich_menu_id", id)
    .order("sort_order", { ascending: true });
  if (areasError) return { data: null, error: richMenuError("rich menu areas fetch failed", areasError) };

  const forms = await listRichMenuForms();
  return {
    data: { menu: menu as LLinkRichMenu, areas: (areas ?? []) as LLinkRichMenuArea[], forms: forms.data ?? [] },
    error: forms.error,
  };
}

export async function createRichMenuFromFormData(formData: FormData): Promise<RichMenuResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "rich menu save failed: service role key missing" };
  if (!companyId) return { data: null, error: "rich menu save failed: company_id missing" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { data: null, error: "rich menu save failed: name missing" };

  const sizeType = normalizeSizeType(String(formData.get("size_type") ?? "large"));
  const size = richMenuSizes[sizeType];
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ll_rich_menus")
    .insert({
      company_id: companyId,
      name,
      title: name,
      description: String(formData.get("description") ?? "").trim(),
      image_url: String(formData.get("image_url") ?? "").trim() || null,
      image_path: String(formData.get("image_url") ?? "").trim() || null,
      size_type: sizeType,
      width: size.width,
      height: size.height,
      status: normalizeStatus(String(formData.get("status") ?? "draft")),
      is_default: Boolean(formData.get("is_default")),
      target_memo: String(formData.get("target_memo") ?? "").trim(),
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data) return { data: null, error: richMenuError("rich menu save failed", error) };
  return { data: (data as { id: string }).id, error: null };
}

export async function updateRichMenuFromFormData(id: string, formData: FormData): Promise<RichMenuResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "rich menu update failed: service role key missing" };
  if (!companyId) return { data: null, error: "rich menu update failed: company_id missing" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { data: null, error: "rich menu update failed: name missing" };

  const sizeType = normalizeSizeType(String(formData.get("size_type") ?? "large"));
  const size = richMenuSizes[sizeType];
  const { error } = await supabase
    .from("ll_rich_menus")
    .update({
      name,
      title: name,
      description: String(formData.get("description") ?? "").trim(),
      image_url: String(formData.get("image_url") ?? "").trim() || null,
      image_path: String(formData.get("image_url") ?? "").trim() || null,
      size_type: sizeType,
      width: size.width,
      height: size.height,
      status: normalizeStatus(String(formData.get("status") ?? "draft")),
      is_default: Boolean(formData.get("is_default")),
      target_memo: String(formData.get("target_memo") ?? "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("id", id);

  if (error) return { data: null, error: richMenuError("rich menu update failed", error) };
  return { data: id, error: null };
}

export async function createRichMenuAreaFromFormData(richMenuId: string, formData: FormData): Promise<RichMenuResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "rich menu area save failed: service role key missing" };
  if (!companyId) return { data: null, error: "rich menu area save failed: company_id missing" };

  const actionType = normalizeActionType(String(formData.get("action_type") ?? "none"));
  const formId = String(formData.get("form_id") ?? "").trim();
  const actionValue = actionType === "form"
    ? formId ? publicFormUrl(formId) : ""
    : String(formData.get("action_value") ?? "").trim();

  const { error } = await supabase.from("ll_rich_menu_areas").insert({
    company_id: companyId,
    rich_menu_id: richMenuId,
    label: String(formData.get("label") ?? "").trim(),
    x: toInt(formData.get("x")),
    y: toInt(formData.get("y")),
    width: toInt(formData.get("width")),
    height: toInt(formData.get("height")),
    bounds: {
      x: toInt(formData.get("x")),
      y: toInt(formData.get("y")),
      width: toInt(formData.get("width")),
      height: toInt(formData.get("height")),
    },
    action_type: actionType,
    action_value: actionType === "none" ? "" : actionValue,
    sort_order: toInt(formData.get("sort_order")),
  });

  if (error) return { data: null, error: richMenuError("rich menu area save failed", error) };
  return { data: richMenuId, error: null };
}

export async function updateRichMenuAreaFromFormData(richMenuId: string, areaId: string, formData: FormData): Promise<RichMenuResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "rich menu area update failed: service role key missing" };
  if (!companyId) return { data: null, error: "rich menu area update failed: company_id missing" };

  const actionType = normalizeActionType(String(formData.get("action_type") ?? "none"));
  const formId = String(formData.get("form_id") ?? "").trim();
  const actionValue = actionType === "form"
    ? formId ? publicFormUrl(formId) : String(formData.get("action_value") ?? "").trim()
    : String(formData.get("action_value") ?? "").trim();

  const x = toInt(formData.get("x"));
  const y = toInt(formData.get("y"));
  const width = toInt(formData.get("width"));
  const height = toInt(formData.get("height"));
  const { error } = await supabase
    .from("ll_rich_menu_areas")
    .update({
      label: String(formData.get("label") ?? "").trim(),
      x,
      y,
      width,
      height,
      bounds: { x, y, width, height },
      action_type: actionType,
      action_value: actionType === "none" ? "" : actionValue,
      sort_order: toInt(formData.get("sort_order")),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("rich_menu_id", richMenuId)
    .eq("id", areaId);

  if (error) return { data: null, error: richMenuError("rich menu area update failed", error) };
  return { data: richMenuId, error: null };
}

export async function deleteRichMenuArea(richMenuId: string, areaId: string): Promise<RichMenuResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: "rich menu area delete failed: service role key missing" };
  if (!companyId) return { data: null, error: "rich menu area delete failed: company_id missing" };

  const { error } = await supabase.from("ll_rich_menu_areas").delete().eq("company_id", companyId).eq("rich_menu_id", richMenuId).eq("id", areaId);
  if (error) return { data: null, error: richMenuError("rich menu area delete failed", error) };
  return { data: richMenuId, error: null };
}
