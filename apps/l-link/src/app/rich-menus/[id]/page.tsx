import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createRichMenuAreaFromFormData, getRichMenu } from "@/lib/rich-menus/lLinkRichMenus";
import { RichMenuPreview } from "../RichMenuPreview";

const actionLabels: Record<string, string> = {
  uri: "URLを開く",
  message: "テキスト送信",
  form: "フォームを開く",
  tel: "電話をかける",
  none: "何もしない",
};

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function addAreaAction(richMenuId: string, formData: FormData) {
  "use server";

  const result = await createRichMenuAreaFromFormData(richMenuId, formData);
  if (result.data) {
    revalidatePath(`/rich-menus/${richMenuId}`);
    redirect(`/rich-menus/${richMenuId}?rich_menu_message=${encodeURIComponent("タップ領域を追加しました")}`);
  }
  redirect(`/rich-menus/${richMenuId}?rich_menu_error=${encodeURIComponent(result.error ?? "タップ領域を追加できませんでした")}`);
}

export default async function RichMenuDetailPage({
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
      <LLinkShell title="リッチメニュー詳細" description="リッチメニューを確認します。">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div>
      </LLinkShell>
    );
  }

  const { menu, areas, forms } = result.data;

  return (
    <LLinkShell title="リッチメニュー詳細" description="タップ領域を確認し、LINE反映前のプレビューを確認します。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/rich-menus" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">一覧に戻る</Link>
          <Link href={`/rich-menus/${id}/edit`} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">編集する</Link>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          LINE公式アカウントへの反映は今後対応です。現在はL-Link内での設計・保存のみで、誤反映防止のため本番API送信は未実装です。
        </div>
        {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div> : null}
        {error || result.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error || result.error}</div> : null}

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <UiCard>
            <h2 className="text-lg font-black">{display(menu.name ?? menu.title)}</h2>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div><dt className="font-bold text-slate-500">ステータス</dt><dd><UiBadge tone={menu.status === "active" ? "green" : "slate"}>{menu.status}</UiBadge></dd></div>
              <div><dt className="font-bold text-slate-500">サイズ</dt><dd>{menu.width} x {menu.height}</dd></div>
              <div><dt className="font-bold text-slate-500">デフォルト</dt><dd>{menu.is_default ? "はい" : "いいえ"}</dd></div>
              <div><dt className="font-bold text-slate-500">LINE反映状態</dt><dd>{menu.line_rich_menu_id ? "反映IDあり" : "未反映"}</dd></div>
              <div><dt className="font-bold text-slate-500">作成日</dt><dd>{formatDate(menu.created_at)}</dd></div>
              <div><dt className="font-bold text-slate-500">更新日</dt><dd>{formatDate(menu.updated_at)}</dd></div>
            </dl>
            {menu.description ? <p className="mt-4 whitespace-pre-wrap text-sm font-bold text-slate-600">{menu.description}</p> : null}
            {menu.target_memo ? <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-600">{menu.target_memo}</p> : null}
            <div className="mt-5">
              <RichMenuPreview menu={menu} areas={areas} />
            </div>
          </UiCard>

          <UiCard>
            <h2 className="text-lg font-black">タップ領域追加</h2>
            {forms.length === 0 ? <p className="mt-2 text-xs font-bold text-amber-700">フォームがありません。フォームアクションを使う場合は先に回答フォームを作成してください。</p> : null}
            <form action={addAreaAction.bind(null, id)} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">エリア名</span>
                <input name="label" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input name="x" type="number" min="0" placeholder="x" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input name="y" type="number" min="0" placeholder="y" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input name="width" type="number" min="0" placeholder="width" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input name="height" type="number" min="0" placeholder="height" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">アクション種別</span>
                <select name="action_type" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">フォームを開く場合のフォーム</span>
                <select name="form_id" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="">選択しない</option>
                  {forms.map((form) => <option key={form.id} value={form.id}>{form.title}{form.is_public ? "" : "（非公開）"}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">アクション値</span>
                <input name="action_value" placeholder="URL、送信テキスト、電話番号など" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">並び順</span>
                <input name="sort_order" type="number" min="0" defaultValue={areas.length} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <button className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">領域を追加</button>
            </form>
          </UiCard>
        </div>

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">タップ領域一覧</h2>
            <UiBadge tone="green">{areas.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">エリア名</th>
                  <th className="px-4 py-3">座標</th>
                  <th className="px-4 py-3">アクション</th>
                  <th className="px-4 py-3">アクション値</th>
                  <th className="px-4 py-3 text-right">並び順</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {areas.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center font-bold text-slate-500">タップ領域がありません</td></tr>
                ) : areas.map((area) => (
                  <tr key={area.id}>
                    <td className="px-4 py-3 font-bold">{display(area.label)}</td>
                    <td className="px-4 py-3 font-mono text-xs">x:{area.x} y:{area.y} w:{area.width} h:{area.height}</td>
                    <td className="px-4 py-3">{actionLabels[area.action_type ?? "none"] ?? area.action_type}</td>
                    <td className="px-4 py-3 break-all">{display(area.action_value)}</td>
                    <td className="px-4 py-3 text-right">{area.sort_order}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
