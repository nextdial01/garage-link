import Link from "next/link";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { listFriends } from "@/lib/line/friends";
import { friendProfileOptions, getFriendProfileOptionLabel } from "@/lib/friends/profileOptions";

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

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const result = await listFriends({
    q: first(query.q),
    friendStatus: first(query.friend_status),
    customerStatus: first(query.customer_status),
    inquiryType: first(query.inquiry_type),
    interestCategory: first(query.interest_category),
  });
  const friends = result.friends;

  return (
    <LLinkShell title="友だち管理" description="LINE友だちと店舗側で管理する顧客情報を確認します。">
      <div className="space-y-5">
        <UiCard>
          <form className="grid gap-3 md:grid-cols-5">
            <input name="q" placeholder="表示名・実名・電話・メール・LINE userId" defaultValue={first(query.q) ?? ""} className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
            <select name="friend_status" defaultValue={first(query.friend_status) ?? "all"} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="all">全て</option>
              <option value="active">有効</option>
              <option value="unfollowed">unfollowed</option>
            </select>
            <select name="customer_status" defaultValue={first(query.customer_status) ?? ""} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">顧客ステータス: 全て</option>
              {friendProfileOptions.customer_status.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">検索</button>
          </form>
        </UiCard>

        {result.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {result.error}
          </div>
        ) : null}

        {!result.error && result.warning ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">
            {result.warning}。タグ数は0として表示しています。
          </div>
        ) : null}

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">友だち一覧</h2>
            <UiBadge tone="green">{friends.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">プロフィール</th>
                  <th className="px-4 py-3">LINE表示名</th>
                  <th className="px-4 py-3">実名</th>
                  <th className="px-4 py-3">LINE userId</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3">顧客ステータス</th>
                  <th className="px-4 py-3">問い合わせ種別</th>
                  <th className="px-4 py-3">興味カテゴリ</th>
                  <th className="px-4 py-3 text-right">タグ数</th>
                  <th className="px-4 py-3">最新メッセージ</th>
                  <th className="px-4 py-3">友だち追加日</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {friends.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center font-bold text-slate-500">データがありません</td>
                  </tr>
                ) : (
                  friends.map((friend) => (
                    <tr key={friend.id} className="hover:bg-green-50/60">
                      <td className="px-4 py-3">
                        {friend.picture_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={friend.picture_url} alt="" className="h-10 w-10 rounded-full bg-slate-100 object-cover" />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-green-50 text-xs font-black text-green-700">LL</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-950">{lineDisplayName(friend)}</td>
                      <td className="px-4 py-3">{display(friend.real_name)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{display(friend.line_user_id)}</td>
                      <td className="px-4 py-3"><UiBadge tone={friend.friend_status === "active" ? "green" : "slate"}>{friend.friend_status}</UiBadge></td>
                      <td className="px-4 py-3">{getFriendProfileOptionLabel("customer_status", friend.customer_status)}</td>
                      <td className="px-4 py-3">{getFriendProfileOptionLabel("inquiry_type", friend.inquiry_type)}</td>
                      <td className="px-4 py-3">{getFriendProfileOptionLabel("interest_category", friend.interest_category)}</td>
                      <td className="px-4 py-3 text-right">{friend.tag_count}</td>
                      <td className="px-4 py-3">{formatDate(friend.last_message_at)}</td>
                      <td className="px-4 py-3">{formatDate(friend.followed_at)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/friends/${friend.id}`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-50">詳細</Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
