import Link from "next/link";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { listSegments } from "@/lib/segments/lLinkSegments";

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function SegmentsPage() {
  const result = await listSegments();
  const segments = result.data ?? [];

  return (
    <LLinkShell title="セグメント" description="タグや顧客ステータスなどの条件で友だちを抽出します。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/segments/new" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">新規作成</Link>
        </div>
        {result.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div> : null}

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">セグメント一覧</h2>
            <UiBadge tone="green">{segments.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">セグメント名</th>
                  <th className="px-4 py-3">説明</th>
                  <th className="px-4 py-3 text-right">条件数</th>
                  <th className="px-4 py-3 text-right">対象者数</th>
                  <th className="px-4 py-3">ステータス</th>
                  <th className="px-4 py-3">作成日</th>
                  <th className="px-4 py-3">更新日</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {segments.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center font-bold text-slate-500">データがありません</td></tr>
                ) : segments.map((segment) => (
                  <tr key={segment.id} className="hover:bg-green-50/60">
                    <td className="px-4 py-3 font-bold text-slate-950"><Link href={`/segments/${segment.id}`}>{segment.name}</Link></td>
                    <td className="px-4 py-3">{display(segment.description)}</td>
                    <td className="px-4 py-3 text-right">{segment.condition_count ?? 0}</td>
                    <td className="px-4 py-3 text-right">{segment.target_count ?? 0}</td>
                    <td className="px-4 py-3"><UiBadge tone={segment.status === "active" ? "green" : "slate"}>{segment.status}</UiBadge></td>
                    <td className="px-4 py-3">{formatDate(segment.created_at)}</td>
                    <td className="px-4 py-3">{formatDate(segment.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/segments/${segment.id}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">詳細</Link>
                        <Link href={`/segments/${segment.id}/edit`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-50">編集</Link>
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
