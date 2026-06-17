import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createLLinkServiceClient, createLLinkUserClient, getCurrentLLinkCompany } from "@/lib/supabase/server";
import { OrganizationForm } from "./OrganizationForm";
import type { OrganizationFields, OrganizationState } from "./types";

type StoreRow = {
  id: string;
  name: string | null;
  business_type: string | null;
  prefecture: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fieldsFromForm(formData: FormData): OrganizationFields {
  return {
    companyName: getString(formData, "company_name"),
    storeName: getString(formData, "store_name"),
    contactName: getString(formData, "contact_name"),
    phone: getString(formData, "phone"),
    email: getString(formData, "email"),
    businessType: getString(formData, "business_type"),
    prefecture: getString(formData, "prefecture"),
    address: getString(formData, "address"),
  };
}

function fieldsFromStore(store: StoreRow | null | undefined, email = ""): OrganizationFields {
  return {
    companyName: store?.name ?? "",
    storeName: store?.name ?? "",
    contactName: "",
    phone: store?.phone ?? "",
    email: store?.email ?? email,
    businessType: store?.business_type ?? "",
    prefecture: store?.prefecture ?? "",
    address: store?.address ?? "",
  };
}

function initialState(fields: OrganizationFields): OrganizationState {
  return {
    status: "idle",
    message: "",
    fields,
  };
}

function errorState(fields: OrganizationFields, message: string): OrganizationState {
  return {
    status: "error",
    message,
    fields,
  };
}

type SafeSupabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function errorMessage(prefix: string, error: SafeSupabaseError | null | undefined) {
  if (!isDevelopment() || !error) return prefix;
  if (error.code === "42501") {
    return `${prefix}（stores への保存権限がありません。service_role に stores への権限が付与されていない可能性があります）`;
  }
  if (isOptionalStoreColumnError(error)) {
    return `${prefix}（stores.prefecture などの補助カラムがDBに存在しない、またはschema cacheが古い可能性があります）`;
  }
  const detail = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" / ");
  return detail ? `${prefix}（${detail.slice(0, 300)}）` : prefix;
}

function isOptionalStoreColumnError(error: SafeSupabaseError | null | undefined) {
  const text = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  return Boolean(
    error &&
      (error.code === "42703" ||
        error.code === "PGRST204" ||
        text.includes("prefecture") ||
        text.includes("contact_name") ||
        text.includes("industry")),
  );
}

function normalizeStoreName(fields: OrganizationFields) {
  return fields.storeName.trim() || fields.companyName.trim();
}

async function saveStore(
  supabase: NonNullable<ReturnType<typeof createLLinkServiceClient>>,
  storeId: string | null,
  storePayload: Record<string, string | null>,
) {
  if (storeId) {
    return supabase
      .from("stores")
      .upsert({ id: storeId, ...storePayload }, { onConflict: "id" })
      .select("id")
      .single();
  }

  return supabase
    .from("stores")
    .insert(storePayload)
    .select("id")
    .single();
}

async function saveOrganization(prevState: OrganizationState, formData: FormData): Promise<OrganizationState> {
  "use server";

  const fields = fieldsFromForm(formData);
  const supabase = createLLinkServiceClient();
  const userClient = await createLLinkUserClient();
  const { data: userData } = await userClient.auth.getUser();
  const user = userData.user;

  if (!user) {
    return errorState(fields, "保存に失敗しました：ログイン情報が取得できません");
  }

  if (!supabase) {
    return errorState(fields, "保存に失敗しました：Supabase接続設定が不足しています");
  }

  if (!fields.companyName) {
    return errorState(fields, "保存に失敗しました：会社名を入力してください");
  }

  const currentCompany = await getCurrentLLinkCompany();
  const now = new Date().toISOString();
  const storeNameForSave = normalizeStoreName(fields);
  const storePayload = {
    name: storeNameForSave,
    business_type: fields.businessType || null,
    industry: fields.businessType || null,
    contact_name: fields.contactName || null,
    prefecture: fields.prefecture || null,
    address: fields.address || null,
    phone: fields.phone || null,
    email: fields.email || user.email || null,
    status: "active",
    updated_at: now,
  };

  let storeId = currentCompany?.companyId ?? null;

  const { data: storeData, error: storeError } = await saveStore(supabase, storeId, {
    ...storePayload,
    created_at: now,
  });

  if (storeError || !storeData?.id) {
    if (isOptionalStoreColumnError(storeError)) {
      const fallbackPayload = {
        name: storeNameForSave,
        business_type: fields.businessType || null,
        address: fields.address || null,
        phone: fields.phone || null,
        email: fields.email || user.email || null,
        status: "active",
        updated_at: now,
        created_at: now,
      };
      const { data: fallbackStoreData, error: fallbackStoreError } = await saveStore(supabase, storeId, fallbackPayload);
      if (fallbackStoreError || !fallbackStoreData?.id) {
        return errorState(fields, errorMessage("保存に失敗しました：stores insert failed", fallbackStoreError));
      }
      storeId = fallbackStoreData.id as string;
    } else {
      return errorState(fields, errorMessage("保存に失敗しました：stores insert failed", storeError));
    }
  } else {
    storeId = storeData.id as string;
  }

  const { error: memberError } = await supabase
    .from("store_members")
    .upsert(
      {
        store_id: storeId,
        user_id: user.id,
        role: "owner",
        display_name: fields.contactName,
        email: fields.email || user.email || null,
        status: "active",
        updated_at: now,
      },
      { onConflict: "store_id,user_id" },
    );

  if (memberError) {
    return errorState(fields, errorMessage("保存に失敗しました：store_members insert failed", memberError));
  }

  const { error: roleError } = await supabase
    .from("ll_staff_roles")
    .upsert(
      {
        company_id: storeId,
        user_id: user.id,
        role: "owner",
        status: "active",
        updated_at: now,
      },
      { onConflict: "company_id,user_id" },
    );

  if (roleError) {
    return errorState(fields, errorMessage("保存に失敗しました：ll_staff_roles insert failed", roleError));
  }

  return {
    status: "success",
    message: "会社・店舗情報を保存しました。LINE接続設定へ進んでください。",
    fields,
  };
}

export default async function OrganizationSettingsPage() {
  const supabase = createLLinkServiceClient();
  const userClient = await createLLinkUserClient();
  const { data: userData } = await userClient.auth.getUser();
  const currentCompany = await getCurrentLLinkCompany();

  let store: StoreRow | null = null;
  if (supabase && currentCompany?.companyId) {
    const { data } = await supabase
      .from("stores")
      .select("id, name, business_type, prefecture, address, phone, email")
      .eq("id", currentCompany.companyId)
      .maybeSingle();
    store = data as StoreRow | null;
  }

  return (
    <LLinkShell title="会社・店舗設定" description="L-Linkを利用する会社・店舗と、現在ユーザーの所属を設定します。">
      <div className="space-y-5">
        <UiCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">初期設定</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                初回利用時は、会社・店舗情報とメンバー所属を作成します。作成後、LINE接続設定で公式アカウント情報を保存できます。
              </p>
            </div>
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700">
              {currentCompany?.source === "ll_staff_roles" ? "L-Link所属あり" : currentCompany?.source === "store_members" ? "互換所属あり" : "未設定"}
            </span>
          </div>
        </UiCard>

        <UiCard>
          <OrganizationForm initialState={initialState(fieldsFromStore(store, userData.user?.email ?? ""))} saveAction={saveOrganization} />
        </UiCard>
      </div>
    </LLinkShell>
  );
}
