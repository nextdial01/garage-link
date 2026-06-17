import Link from "next/link";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { listBroadcasts } from "@/lib/broadcasts/lLinkBroadcasts";

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function targetLabel(type: string) {
  if (type === "tag") return "タグ指定";
  if (type === "segment") return "セグメント指定";
  return "全友だち";
}

export default async function BroadcastsPage() {
  const result = await listBroadcasts();
  const broadcasts = result.data ?? [];

  return (
    <LLinkShell title="一斉配信" description="配信下書きと対象者確認を管理します。本送信はまだ行いません。">
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          LINE公式アカウントへの本送信は今後対応です。誤送信防止のため、本番API送信は未実装です。
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/broadcasts/new" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">下書き作成</Link>
        </div>
        {result.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div> : null}

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">配信一覧</h2>
            <UiBadge tone="green">{broadcasts.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">配信名</th>
                  <th className="px-4 py-3">ステータス</th>
                  <th className="px-4 py-3">配信対象</th>
                  <th className="px-4 py-3 text-right">対象者数</th>
                  <th className="px-4 py-3">配信予定日時</th>
                  <th className="px-4 py-3">作成日</th>
                  <th className="px-4 py-3">更新日</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {broadcasts.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center font-bold text-slate-500">データがありません</td></tr>
                ) : broadcasts.map((broadcast) => (
                  <tr key={broadcast.id} className="hover:bg-green-50/60">
                    <td className="px-4 py-3 font-bold text-slate-950"><Link href={`/broadcasts/${broadcast.id}`}>{display(broadcast.name ?? broadcast.title)}</Link></td>
                    <td className="px-4 py-3"><UiBadge tone={broadcast.status === "scheduled" ? "green" : "slate"}>{broadcast.status}</UiBadge></td>
                    <td className="px-4 py-3">{targetLabel(broadcast.target_type)}</td>
                    <td className="px-4 py-3 text-right">{broadcast.target_count}</td>
                    <td className="px-4 py-3">{formatDate(broadcast.scheduled_at)}</td>
                    <td className="px-4 py-3">{formatDate(broadcast.created_at)}</td>
                    <td className="px-4 py-3">{formatDate(broadcast.updated_at)}</td>
                    <td className="px-4 py-3"><Link href={`/broadcasts/${broadcast.id}`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">詳細</Link></td>
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
