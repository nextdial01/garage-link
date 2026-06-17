import Link from "next/link";
import { notFound } from "next/navigation";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { getFriendProfileOptionLabel } from "@/lib/friends/profileOptions";
import { getSegment } from "@/lib/segments/lLinkSegments";

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

export default async function SegmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const message = typeof resolvedSearchParams.segment_message === "string" ? resolvedSearchParams.segment_message : "";
  const result = await getSegment(id);
  if (!result.data) {
    if (result.error === "segment not found") notFound();
    return (
      <LLinkShell title="セグメント詳細" description="セグメントを確認します。">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div>
      </LLinkShell>
    );
  }

  const { segment, conditions, targets } = result.data;

  return (
    <LLinkShell title="セグメント詳細" description="条件に一致する友だちを確認します。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/segments" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">一覧に戻る</Link>
          <Link href={`/segments/${id}/edit`} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">編集する</Link>
        </div>
        {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div> : null}

        <UiCard>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">{segment.name}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm font-bold text-slate-500">{display(segment.description)}</p>
            </div>
            <UiBadge tone={segment.status === "active" ? "green" : "slate"}>{segment.status}</UiBadge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">条件数</p><p className="mt-1 text-2xl font-black">{conditions.length}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">対象者数</p><p className="mt-1 text-2xl font-black">{targets.length}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">抽出方式</p><p className="mt-1 text-sm font-black">company_id分離 / AND条件</p></div>
          </div>
        </UiCard>

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">対象者一覧</h2>
            <UiBadge tone="green">{targets.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">LINE表示名</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3">顧客ステータス</th>
                  <th className="px-4 py-3">問い合わせ種別</th>
                  <th className="px-4 py-3">興味カテゴリ</th>
                  <th className="px-4 py-3">タグ</th>
                  <th className="px-4 py-3">最終メッセージ</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {targets.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center font-bold text-slate-500">条件に一致する友だちがいません</td></tr>
                ) : targets.map((friend) => (
                  <tr key={friend.id} className="hover:bg-green-50/60">
                    <td className="px-4 py-3 font-bold">{lineDisplayName(friend)}</td>
                    <td className="px-4 py-3"><UiBadge tone={friend.friend_status === "active" ? "green" : "slate"}>{friend.friend_status}</UiBadge></td>
                    <td className="px-4 py-3">{getFriendProfileOptionLabel("customer_status", friend.customer_status)}</td>
                    <td className="px-4 py-3">{getFriendProfileOptionLabel("inquiry_type", friend.inquiry_type)}</td>
                    <td className="px-4 py-3">{getFriendProfileOptionLabel("interest_category", friend.interest_category)}</td>
                    <td className="px-4 py-3">{friend.tags.map((tag) => tag.name).join(", ") || "-"}</td>
                    <td className="px-4 py-3">{formatDate(friend.last_message_at)}</td>
                    <td className="px-4 py-3"><Link href={`/friends/${friend.id}`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">詳細</Link></td>
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
