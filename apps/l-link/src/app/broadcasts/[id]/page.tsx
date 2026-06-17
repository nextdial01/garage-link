import Link from "next/link";
import { notFound } from "next/navigation";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { getBroadcast } from "@/lib/broadcasts/lLinkBroadcasts";
import { getFriendProfileOptionLabel } from "@/lib/friends/profileOptions";

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function lineDisplayName(friend: { display_name: string | null; line_user_id: string }) {
  return friend.display_name || friend.line_user_id;
}

function targetLabel(type: string) {
  if (type === "tag") return "タグ指定";
  if (type === "segment") return "セグメント指定";
  return "全友だち";
}

export default async function BroadcastDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const message = typeof resolvedSearchParams.broadcast_message === "string" ? resolvedSearchParams.broadcast_message : "";
  const result = await getBroadcast(id);
  if (!result.data) {
    if (result.error === "broadcast not found") notFound();
    return (
      <LLinkShell title="一斉配信詳細" description="配信下書きを確認します。">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div>
      </LLinkShell>
    );
  }

  const { broadcast, targets, savedTargets } = result.data;

  return (
    <LLinkShell title="一斉配信詳細" description="下書き内容と配信対象者を確認します。本送信はまだ行いません。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/broadcasts" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">一覧に戻る</Link>
          <button disabled className="cursor-not-allowed rounded-xl bg-slate-300 px-4 py-2 text-sm font-bold text-white">本送信は未実装</button>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          LINE公式アカウントへの本送信は今後対応です。現在は配信下書き・対象者確認・ログ土台のみで、push / multicast / broadcast APIは呼びません。
        </div>
        {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div> : null}

        <UiCard>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">{display(broadcast.name ?? broadcast.title)}</h2>
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700">{display(broadcast.message_text ?? broadcast.message_body)}</p>
            </div>
            <UiBadge tone={broadcast.status === "scheduled" ? "green" : "slate"}>{broadcast.status}</UiBadge>
          </div>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-4">
            <div><dt className="font-bold text-slate-500">配信対象条件</dt><dd>{targetLabel(broadcast.target_type)}</dd></div>
            <div><dt className="font-bold text-slate-500">対象者数</dt><dd>{targets.length}</dd></div>
            <div><dt className="font-bold text-slate-500">保存済み対象ログ</dt><dd>{savedTargets.length}</dd></div>
            <div><dt className="font-bold text-slate-500">配信予定日時</dt><dd>{formatDate(broadcast.scheduled_at)}</dd></div>
          </dl>
        </UiCard>

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">対象者一覧</h2>
            <UiBadge tone="green">{targets.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">LINE表示名</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3">顧客ステータス</th>
                  <th className="px-4 py-3">問い合わせ種別</th>
                  <th className="px-4 py-3">興味カテゴリ</th>
                  <th className="px-4 py-3">タグ</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {targets.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center font-bold text-slate-500">配信対象者がいません</td></tr>
                ) : targets.map((friend) => (
                  <tr key={friend.id} className="hover:bg-green-50/60">
                    <td className="px-4 py-3 font-bold">{lineDisplayName(friend)}</td>
                    <td className="px-4 py-3"><UiBadge tone={friend.friend_status === "active" ? "green" : "slate"}>{friend.friend_status}</UiBadge></td>
                    <td className="px-4 py-3">{getFriendProfileOptionLabel("customer_status", friend.customer_status)}</td>
                    <td className="px-4 py-3">{getFriendProfileOptionLabel("inquiry_type", friend.inquiry_type)}</td>
                    <td className="px-4 py-3">{getFriendProfileOptionLabel("interest_category", friend.interest_category)}</td>
                    <td className="px-4 py-3">{friend.tags.map((tag) => tag.name).join(", ") || "-"}</td>
                    <td className="px-4 py-3"><Link href={`/friends/${friend.id}`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">詳細</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </UiCard>

        <UiCard>
          <h2 className="text-lg font-black">配信ログ枠</h2>
          <p className="mt-3 text-sm font-bold text-slate-500">本送信フェーズで送信結果ログを表示します。現時点では対象者プレビューのみ保存しています。</p>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
