import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import {
  deleteRichMenuArea,
  getRichMenu,
  updateRichMenuAreaFromFormData,
  updateRichMenuFromFormData,
} from "@/lib/rich-menus/lLinkRichMenus";
import { RichMenuForm } from "../../RichMenuForm";
import { RichMenuPreview } from "../../RichMenuPreview";

const actionLabels: Record<string, string> = {
  uri: "URLを開く",
  message: "テキスト送信",
  form: "フォームを開く",
  tel: "電話をかける",
  none: "何もしない",
};

function display(value: string | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

async function updateRichMenuAction(richMenuId: string, formData: FormData) {
  "use server";

  const result = await updateRichMenuFromFormData(richMenuId, formData);
  if (result.data) {
    revalidatePath(`/rich-menus/${richMenuId}`);
    redirect(`/rich-menus/${richMenuId}/edit?rich_menu_message=${encodeURIComponent("リッチメニューを更新しました")}`);
  }
  redirect(`/rich-menus/${richMenuId}/edit?rich_menu_error=${encodeURIComponent(result.error ?? "リッチメニューを更新できませんでした")}`);
}

async function updateAreaAction(richMenuId: string, areaId: string, formData: FormData) {
  "use server";

  const result = await updateRichMenuAreaFromFormData(richMenuId, areaId, formData);
  if (result.data) {
    revalidatePath(`/rich-menus/${richMenuId}/edit`);
    redirect(`/rich-menus/${richMenuId}/edit?rich_menu_message=${encodeURIComponent("タップ領域を更新しました")}`);
  }
  redirect(`/rich-menus/${richMenuId}/edit?rich_menu_error=${encodeURIComponent(result.error ?? "タップ領域を更新できませんでした")}`);
}

async function deleteAreaAction(richMenuId: string, areaId: string) {
  "use server";

  const result = await deleteRichMenuArea(richMenuId, areaId);
  if (result.data) {
    revalidatePath(`/rich-menus/${richMenuId}/edit`);
    redirect(`/rich-menus/${richMenuId}/edit?rich_menu_message=${encodeURIComponent("タップ領域を削除しました")}`);
  }
  redirect(`/rich-menus/${richMenuId}/edit?rich_menu_error=${encodeURIComponent(result.error ?? "タップ領域を削除できませんでした")}`);
}

export default async function EditRichMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const message = typeof resolvedSearchParams.rich_menu_message === "string" ? resolvedSearchParams.rich_menu_message : "";
  const error = typeof resolvedSearchParams.rich_menu_error === "string" ? resolvedSearchParams.rich_menu_error : "";
  const result = await getRichMenu(id);
  if (!result.data) {
    if (result.error === "rich menu not found") notFound();
    return (
      <LLinkShell title="リッチメニュー編集" description="リッチメニューを編集します。">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div>
      </LLinkShell>
    );
  }

  const { menu, areas, forms } = result.data;

  return (
    <LLinkShell title="リッチメニュー編集" description="リッチメニュー本体とタップ領域を編集します。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/rich-menus/${id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">詳細に戻る</Link>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          LINE公式アカウントへの反映は今後対応です。現在はL-Link内での設計・保存のみです。
        </div>
        {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div> : null}
        {error || result.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error || result.error}</div> : null}

        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <UiCard>
            <h2 className="text-lg font-black">基本設定</h2>
            <div className="mt-5">
              <RichMenuForm menu={menu} action={updateRichMenuAction.bind(null, id)} submitLabel="更新する" />
            </div>
          </UiCard>
          <UiCard>
            <h2 className="text-lg font-black">プレビュー</h2>
            <div className="mt-5">
              <RichMenuPreview menu={menu} areas={areas} />
            </div>
          </UiCard>
        </div>

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">タップ領域編集</h2>
            <UiBadge tone="green">{areas.length}件</UiBadge>
          </div>
          <div className="divide-y divide-slate-100">
            {areas.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm font-bold text-slate-500">タップ領域がありません。詳細画面から追加してください。</p>
            ) : areas.map((area) => (
              <form key={area.id} action={updateAreaAction.bind(null, id, area.id)} className="grid gap-3 px-5 py-4 xl:grid-cols-[1fr_2fr_auto]">
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500">エリア名</span>
                    <input name="label" defaultValue={area.label ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500">並び順</span>
                    <input name="sort_order" type="number" min="0" defaultValue={area.sort_order} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    <input name="x" type="number" min="0" defaultValue={area.x} placeholder="x" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <input name="y" type="number" min="0" defaultValue={area.y} placeholder="y" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <input name="width" type="number" min="0" defaultValue={area.width} placeholder="width" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <input name="height" type="number" min="0" defaultValue={area.height} placeholder="height" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <select name="action_type" defaultValue={area.action_type ?? "none"} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select name="form_id" className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <option value="">フォーム選択なし</option>
                      {forms.map((form) => <option key={form.id} value={form.id}>{form.title}{form.is_public ? "" : "（非公開）"}</option>)}
                    </select>
                    <input name="action_value" defaultValue={area.action_value ?? ""} placeholder={display(area.action_value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <button className="rounded-lg border border-green-200 px-3 py-2 text-xs font-bold text-green-700">更新</button>
                  <button formAction={deleteAreaAction.bind(null, id, area.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">削除</button>
                </div>
              </form>
            ))}
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
