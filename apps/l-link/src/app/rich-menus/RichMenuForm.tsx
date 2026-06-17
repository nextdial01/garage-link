import { richMenuSizes, richMenuStatuses, type LLinkRichMenu } from "@/lib/rich-menus/lLinkRichMenus";

const statusLabels: Record<string, string> = {
  draft: "下書き",
  active: "有効",
  inactive: "停止中",
};

export function RichMenuForm({
  menu,
  action,
  submitLabel,
}: {
  menu?: LLinkRichMenu | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="text-xs font-bold text-slate-500">リッチメニュー名</span>
        <input name="name" required defaultValue={menu?.name ?? menu?.title ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-500">ステータス</span>
        <select name="status" defaultValue={menu?.status ?? "draft"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
          {richMenuStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-500">サイズ</span>
        <select name="size_type" defaultValue={menu?.size_type === "small" ? "small" : "large"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
          {Object.entries(richMenuSizes).map(([value, size]) => <option key={value} value={value}>{size.label}</option>)}
        </select>
      </label>
      <label className="flex items-end gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
        <input name="is_default" type="checkbox" defaultChecked={Boolean(menu?.is_default)} />
        デフォルトにする
      </label>
      <label className="block md:col-span-2">
        <span className="text-xs font-bold text-slate-500">画像URL</span>
        <input name="image_url" type="url" defaultValue={menu?.image_url ?? menu?.image_path ?? ""} placeholder="https://example.com/rich-menu.png" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <span className="mt-1 block text-xs font-bold text-slate-400">画像アップロードは次フェーズで追加します。現在はURL指定のみです。</span>
      </label>
      <label className="block md:col-span-2">
        <span className="text-xs font-bold text-slate-500">説明</span>
        <textarea name="description" rows={3} defaultValue={menu?.description ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="block md:col-span-2">
        <span className="text-xs font-bold text-slate-500">表示対象メモ</span>
        <textarea name="target_memo" rows={3} defaultValue={menu?.target_memo ?? ""} placeholder="例: 初回友だち追加後、購入相談タグの友だち向け" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <div className="md:col-span-2">
        <button className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">{submitLabel}</button>
      </div>
    </form>
  );
}
