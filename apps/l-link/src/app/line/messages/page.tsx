import Link from "next/link";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createLLinkServiceClient, getCurrentLLinkCompany } from "@/lib/supabase/server";

type MessageLogRow = {
  id: string;
  direction: string;
  message_type: string | null;
  message_body: string | null;
  webhook_event_id: string | null;
  received_at: string | null;
  sent_at: string | null;
  status: string;
  created_at: string;
  ll_line_friends:
    | {
        id: string;
        line_user_id: string;
        display_name: string | null;
      }
    | {
        id: string;
        line_user_id: string;
        display_name: string | null;
      }[]
    | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function friendFromRow(row: MessageLogRow) {
  const related = row.ll_line_friends;
  if (Array.isArray(related)) return related[0] ?? null;
  return related;
}

async function listMessageLogs() {
  const supabase = createLLinkServiceClient();
  const currentCompany = await getCurrentLLinkCompany();
  const companyId = currentCompany?.companyId ?? null;

  if (!supabase) return { logs: [] as MessageLogRow[], error: "message logs fetch failed: service role key missing" };
  if (!companyId) return { logs: [] as MessageLogRow[], error: "message logs fetch failed: company_id missing" };

  const { data, error } = await supabase
    .from("ll_message_logs")
    .select("id, direction, message_type, message_body, webhook_event_id, received_at, sent_at, status, created_at, ll_line_friends(id, line_user_id, display_name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    const detail = process.env.NODE_ENV !== "production" ? `: ${error.code ?? "unknown"} / ${error.message}` : "";
    return { logs: [] as MessageLogRow[], error: `message logs fetch failed${detail}` };
  }

  return { logs: (data ?? []) as unknown as MessageLogRow[], error: null };
}

export default async function LineMessagesPage() {
  const result = await listMessageLogs();

  return (
    <LLinkShell title="受信・テスト送信ログ" description="Webhookで受信したメッセージと、1ユーザー限定のテスト送信履歴を確認します。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/settings/line" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">
            LINE接続へ
          </Link>
          <UiBadge tone="slate">本番一斉配信なし</UiBadge>
        </div>

        {result.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div>
        ) : null}

        <UiCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">メッセージログ</h2>
              <p className="mt-1 text-sm text-slate-500">Token / Secretは表示しません。直近100件まで表示します。</p>
            </div>
            <UiBadge tone="green">{result.logs.length}件</UiBadge>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">送信者</th>
                  <th className="px-4 py-3">方向</th>
                  <th className="px-4 py-3">本文</th>
                  <th className="px-4 py-3">Webhook Event ID</th>
                  <th className="px-4 py-3">ステータス</th>
                  <th className="px-4 py-3">日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center font-bold text-slate-400">
                      まだメッセージログがありません。
                    </td>
                  </tr>
                ) : (
                  result.logs.map((log) => {
                    const friend = friendFromRow(log);
                    const friendLabel = friend?.display_name || friend?.line_user_id || "-";
                    const date = log.received_at ?? log.sent_at ?? log.created_at;
                    return (
                      <tr key={log.id} className="hover:bg-green-50/60">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {friend?.id ? <Link href={`/friends/${friend.id}`}>{friendLabel}</Link> : friendLabel}
                          {friend?.line_user_id ? <div className="mt-1 text-xs text-slate-400">{friend.line_user_id}</div> : null}
                        </td>
                        <td className="px-4 py-3"><UiBadge tone={log.direction === "inbound" ? "green" : "slate"}>{log.direction}</UiBadge></td>
                        <td className="max-w-md px-4 py-3 text-slate-700">{log.message_body || "-"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.webhook_event_id || "-"}</td>
                        <td className="px-4 py-3">{log.status}</td>
                        <td className="px-4 py-3">{formatDate(date)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
