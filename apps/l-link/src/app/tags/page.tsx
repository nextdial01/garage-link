import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { listTags } from "@/lib/line/friends";
import { createLLinkServiceClient, getCurrentLLinkCompany } from "@/lib/supabase/server";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function safeError(error: { code?: string; message?: string } | null | undefined, operation: string) {
  if (!isDevelopment()) return "保存に失敗しました";
  if (error?.code === "23505") return `${operation}: 同じタグ名が既に存在します`;
  if (error?.code === "42501") return `${operation}: RLS violation or permission denied`;
  return `${operation}: ${error?.code ? `${error.code} / ` : ""}${error?.message ?? "unknown error"}`.slice(0, 220);
}

async function getCompanyId() {
  const currentCompany = await getCurrentLLinkCompany();
  return currentCompany?.companyId ?? null;
}

function tagRedirect(status: "success" | "error", message: string): never {
  const params = new URLSearchParams({ tag_status: status, tag_message: message });
  redirect(`/tags?${params.toString()}`);
}

async function createTag(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) tagRedirect("error", "service role key missing");
  if (!companyId) tagRedirect("error", "company_id が取得できません");
  if (!name) tagRedirect("error", "タグ名を入力してください");

  const { error } = await supabase.from("ll_tags").insert({ company_id: companyId, name, color, description });
  if (error) tagRedirect("error", safeError(error, "tag create failed"));
  revalidatePath("/tags");
  tagRedirect("success", "タグを作成しました");
}

async function updateTag(tagId: string, formData: FormData) {
  "use server";

  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) tagRedirect("error", "service role key missing");
  if (!companyId) tagRedirect("error", "company_id が取得できません");

  const { error } = await supabase
    .from("ll_tags")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      color: String(formData.get("color") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("id", tagId);

  if (error) tagRedirect("error", safeError(error, "tag update failed"));
  revalidatePath("/tags");
  tagRedirect("success", "タグを更新しました");
}

async function deleteTag(tagId: string) {
  "use server";

  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) tagRedirect("error", "service role key missing");
  if (!companyId) tagRedirect("error", "company_id が取得できません");

  const { error } = await supabase.from("ll_tags").delete().eq("company_id", companyId).eq("id", tagId);
  if (error) tagRedirect("error", safeError(error, "tag delete failed"));
  revalidatePath("/tags");
  tagRedirect("success", "タグを削除しました");
}

export default async function TagsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tagStatus = typeof resolvedSearchParams.tag_status === "string" ? resolvedSearchParams.tag_status : "";
  const tagMessage = typeof resolvedSearchParams.tag_message === "string" ? resolvedSearchParams.tag_message : "";
  const tags = await listTags();

  return (
    <LLinkShell title="タグ管理" description="友だち分類に使うタグを作成・編集します。">
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {tagMessage ? (
          <div
            className={
              tagStatus === "success"
                ? "rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700 lg:col-span-2"
                : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 lg:col-span-2"
            }
          >
            {tagMessage}
          </div>
        ) : null}
        <UiCard>
          <h2 className="text-lg font-black">タグ作成</h2>
          <form action={createTag} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-500">タグ名</span>
              <input name="name" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">色</span>
              <input name="color" placeholder="#16A34A" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500">説明</span>
              <textarea name="description" rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <button className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">タグ作成</button>
          </form>
        </UiCard>

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">タグ一覧</h2>
            <UiBadge tone="green">{tags.length}件</UiBadge>
          </div>
          <div className="divide-y divide-slate-100">
            {tags.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm font-bold text-slate-500">データがありません</p>
            ) : (
              tags.map((tag) => (
                <form key={tag.id} action={updateTag.bind(null, tag.id)} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_160px_1fr_auto]">
                  <input name="name" defaultValue={tag.name} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <input name="color" defaultValue={tag.color ?? ""} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <input name="description" placeholder="説明" defaultValue={tag.description ?? ""} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">編集</button>
                    <button formAction={deleteTag.bind(null, tag.id)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600">削除</button>
                  </div>
                </form>
              ))
            )}
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
