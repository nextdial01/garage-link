import Link from "next/link";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { listRichMenus } from "@/lib/rich-menus/lLinkRichMenus";

const statusLabels: Record<string, string> = {
  draft: "下書き",
  active: "有効",
  inactive: "停止中",
};

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function sizeLabel(width: number, height: number) {
  return `${width} x ${height}`;
}

export default async function RichMenusPage() {
  const result = await listRichMenus();
  const menus = result.data ?? [];

  return (
    <LLinkShell title="リッチメニュー" description="LINE公式アカウントに反映する前のリッチメニュー設計をL-Link内で管理します。">
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          LINE公式アカウントへの反映は今後対応です。現在はL-Link内での設計・保存のみで、誤反映防止のため本番API送信は未実装です。
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/rich-menus/new" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">
            新規作成
          </Link>
        </div>

        {result.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div> : null}

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">リッチメニュー一覧</h2>
            <UiBadge tone="green">{menus.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">リッチメニュー名</th>
                  <th className="px-4 py-3">ステータス</th>
                  <th className="px-4 py-3">サイズ</th>
                  <th className="px-4 py-3 text-right">タップ領域</th>
                  <th className="px-4 py-3">デフォルト</th>
                  <th className="px-4 py-3">作成日</th>
                  <th className="px-4 py-3">更新日</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {menus.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center font-bold text-slate-500">データがありません</td></tr>
                ) : menus.map((menu) => (
                  <tr key={menu.id} className="hover:bg-green-50/60">
                    <td className="px-4 py-3 font-bold text-slate-950"><Link href={`/rich-menus/${menu.id}`}>{display(menu.name ?? menu.title)}</Link></td>
                    <td className="px-4 py-3"><UiBadge tone={menu.status === "active" ? "green" : "slate"}>{statusLabels[menu.status] ?? menu.status}</UiBadge></td>
                    <td className="px-4 py-3">{sizeLabel(menu.width, menu.height)}</td>
                    <td className="px-4 py-3 text-right">{menu.area_count ?? 0}</td>
                    <td className="px-4 py-3">{menu.is_default ? "はい" : "いいえ"}</td>
                    <td className="px-4 py-3">{formatDate(menu.created_at)}</td>
                    <td className="px-4 py-3">{formatDate(menu.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/rich-menus/${menu.id}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">詳細</Link>
                        <Link href={`/rich-menus/${menu.id}/edit`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-50">編集</Link>
                      </div>
                    </td>
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
