import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createLLinkServiceClient, getCurrentLLinkCompany, getPrimaryLineAccount } from "@/lib/supabase/server";
import { sha256Hex } from "@/lib/line/security";
import { upsertLineFriend } from "@/lib/line/upsertLineFriend";

type DiagnosticEventType = "follow" | "message" | "postback" | "unfollow";

type WebhookEventRow = {
  id: string;
  event_id: string | null;
  event_type: string;
  source_type: string | null;
  source_user_hash: string | null;
  message_type: string | null;
  raw_event_hash: string | null;
  received_at: string;
  processed_at: string | null;
  status: string;
  line_friend_id: string | null;
};

type FriendLookup = {
  id: string;
  line_user_id: string;
};

type DiagnosticAccount = {
  id: string;
  company_id: string;
  account_name: string | null;
  channel_id: string | null;
  basic_id: string | null;
  line_bot_user_id: string | null;
  webhook_url: string | null;
  is_connected: boolean | null;
  connection_status: string | null;
  verified_at: string | null;
  last_connection_error: string | null;
  channel_secret_last4: string | null;
  channel_access_token_last4: string | null;
};

function appUrl() {
  return process.env.L_LINK_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function safeErrorDetail(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ? `${error.code} / ` : "";
  const message = error?.message ?? "unknown error";
  return `${code}${message}`.slice(0, 220);
}

function diagnosticRedirect(status: "success" | "error", message: string): never {
  const params = new URLSearchParams({
    diagnostic_status: status,
    diagnostic_message: message,
  });
  redirect(`/settings/line/diagnostics?${params.toString()}`);
}

function dbFailure(operation: string, error: { code?: string; message?: string } | null | undefined) {
  if (!isDevelopment()) return "テストイベント作成に失敗しました";
  if (error?.code === "42501") {
    return `テストイベント作成に失敗しました：${operation}: 権限がありません（${safeErrorDetail(error)}）`;
  }
  return `テストイベント作成に失敗しました：${operation}: ${safeErrorDetail(error)}`;
}

async function ensureDiagnosticAccount(companyId: string) {
  const supabase = createLLinkServiceClient();
  if (!supabase) {
    return { account: null, error: "service role key missing" };
  }

  const existing = (await getPrimaryLineAccount(companyId)) as DiagnosticAccount | null;
  if (existing) return { account: existing, error: null };

  const webhookUrl = `${appUrl().replace(/\/$/, "")}/api/line/webhook`;
  const { data, error } = await supabase
    .from("ll_line_accounts")
    .insert({
      company_id: companyId,
      account_name: "開発用テストアカウント",
      line_bot_user_id: "test_destination",
      webhook_url: webhookUrl,
      is_connected: false,
      connection_status: "development_test",
    })
    .select("id, company_id, account_name, channel_id, basic_id, line_bot_user_id, webhook_url, is_connected, connection_status, verified_at, last_connection_error, channel_secret_last4, channel_access_token_last4")
    .maybeSingle();

  if (error) {
    return { account: null, error: dbFailure("ll_line_accounts insert failed", error) };
  }

  if (!data) {
    return { account: null, error: "テストイベント作成に失敗しました：開発用LINE公式アカウント設定を作成できませんでした" };
  }

  return { account: data as DiagnosticAccount, error: null };
}

async function createTestWebhookEvent(eventType: DiagnosticEventType) {
  "use server";

  if (process.env.NODE_ENV === "production") {
    diagnosticRedirect("error", "productionではテストイベントを作成できません");
  }

  const supabase = createLLinkServiceClient();
  const currentCompany = await getCurrentLLinkCompany();
  const companyId = currentCompany?.companyId ?? null;

  if (!supabase) {
    diagnosticRedirect("error", "テストイベント作成に失敗しました：service role key missing");
  }

  if (!companyId) {
    diagnosticRedirect("error", "テストイベント作成に失敗しました：company_id が取得できません");
  }

  const { account, error: accountError } = await ensureDiagnosticAccount(companyId);
  if (accountError || !account?.id) {
    diagnosticRedirect("error", accountError ?? "テストイベント作成に失敗しました：line_account_id を準備できません");
  }

  const receivedAt = new Date().toISOString();
  const lineUserId = `test_user_${eventType}`;
  const eventId = `test_${eventType}_${Date.now()}`;
  const sourceUserHash = sha256Hex(lineUserId);
  const eventHash = sha256Hex(`${eventId}:${eventType}:${sourceUserHash}`);

  const { data: webhookRow, error: webhookError } = await supabase
    .from("ll_line_webhook_events")
    .insert({
      company_id: companyId,
      line_account_id: account.id,
      event_id: eventId,
      event_type: eventType,
      source_type: "user",
      source_user_hash: sourceUserHash,
      message_type: eventType === "message" ? "text" : null,
      raw_event_hash: eventHash,
      received_at: receivedAt,
      processed_at: receivedAt,
      status: "processed",
    })
    .select("id")
    .maybeSingle();

  if (webhookError || !webhookRow?.id) {
    diagnosticRedirect("error", dbFailure("ll_line_webhook_events insert failed", webhookError));
  }

  if (eventType === "follow" || eventType === "message" || eventType === "postback" || eventType === "unfollow") {
    let friend: { id: string };

    try {
      friend = await upsertLineFriend({
        supabase,
        companyId,
        lineAccountId: account.id,
        lineUserId,
        channelAccessToken: null,
        eventType,
        receivedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      diagnosticRedirect("error", `テストイベント作成に失敗しました：ll_line_friends upsert failed: ${message.slice(0, 180)}`);
    }

    const { error: webhookUpdateError } = await supabase.from("ll_line_webhook_events").update({ line_friend_id: friend.id }).eq("id", webhookRow.id);
    if (webhookUpdateError) {
      diagnosticRedirect("error", dbFailure("ll_line_webhook_events update failed", webhookUpdateError));
    }

    if (eventType === "message") {
      const { error: messageError } = await supabase.from("ll_message_logs").insert({
        company_id: companyId,
        line_account_id: account.id,
        line_friend_id: friend.id,
        direction: "inbound",
        message_type: "text",
        message_body: "開発用テストメッセージ",
        message_hash: sha256Hex("開発用テストメッセージ"),
        received_at: receivedAt,
        status: "received",
      });

      if (messageError) {
        diagnosticRedirect("error", dbFailure("ll_message_logs insert failed", messageError));
      }
    }
  }

  revalidatePath("/settings/line/diagnostics");
  revalidatePath("/friends");
  diagnosticRedirect("success", `テスト${eventType}イベントを作成しました`);
}

async function getDiagnostics() {
  const supabase = createLLinkServiceClient();
  const currentCompany = await getCurrentLLinkCompany();
  const companyId = currentCompany?.companyId ?? null;
  if (!supabase || !companyId) {
    return {
      account: null,
      companyId,
      latestReceivedAt: null,
      todayCount: 0,
      followCount: 0,
      messageCount: 0,
      events: [] as WebhookEventRow[],
      friendMap: new Map<string, string>(),
    };
  }

  const account = await getPrimaryLineAccount(companyId);
  const today = startOfTodayIso();

  const baseQuery = supabase.from("ll_line_webhook_events").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("received_at", today);
  const followQuery = supabase.from("ll_line_webhook_events").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("event_type", "follow").gte("received_at", today);
  const messageQuery = supabase.from("ll_line_webhook_events").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("event_type", "message").gte("received_at", today);

  const [todayResult, followResult, messageResult, latestResult] = await Promise.all([
    baseQuery,
    followQuery,
    messageQuery,
    supabase
      .from("ll_line_webhook_events")
      .select("id, event_id, event_type, source_type, source_user_hash, message_type, raw_event_hash, received_at, processed_at, status, line_friend_id")
      .eq("company_id", companyId)
      .order("received_at", { ascending: false })
      .limit(10),
  ]);

  const events = (latestResult.data ?? []) as WebhookEventRow[];
  const friendIds = events.map((event) => event.line_friend_id).filter((id): id is string => Boolean(id));
  const friendMap = new Map<string, string>();

  if (friendIds.length > 0) {
    const { data: friends } = await supabase.from("ll_line_friends").select("id, line_user_id").eq("company_id", companyId).in("id", friendIds);
    for (const friend of (friends ?? []) as FriendLookup[]) {
      friendMap.set(friend.id, friend.line_user_id);
    }
  }

  return {
    account,
    companyId,
    latestReceivedAt: events[0]?.received_at ?? null,
    todayCount: todayResult.count ?? 0,
    followCount: followResult.count ?? 0,
    messageCount: messageResult.count ?? 0,
    events,
    friendMap,
  };
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <UiBadge tone={ok ? "green" : "slate"}>{ok ? "設定済み" : "未設定"}</UiBadge>
    </div>
  );
}

export default async function LineDiagnosticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const diagnosticStatus = typeof resolvedSearchParams.diagnostic_status === "string" ? resolvedSearchParams.diagnostic_status : "";
  const diagnosticMessage = typeof resolvedSearchParams.diagnostic_message === "string" ? resolvedSearchParams.diagnostic_message : "";
  const diagnostics = await getDiagnostics();
  const account = diagnostics.account;
  const webhookUrl = account?.webhook_url ?? `${appUrl().replace(/\/$/, "")}/api/line/webhook`;
  const isDevelopment = process.env.NODE_ENV !== "production";

  return (
    <LLinkShell title="LINE接続診断" description="LINE接続設定、Webhook受信状況、直近イベントを安全に確認します。">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/settings/line" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">LINE接続へ戻る</Link>
      </div>

      <div className="space-y-5">
        {diagnosticMessage ? (
          <div
            className={
              diagnosticStatus === "success"
                ? "rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700"
                : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
            }
          >
            {diagnosticMessage}
          </div>
        ) : null}

        <UiCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">設定状態</h2>
              <p className="mt-1 text-sm text-slate-500">Secret / Tokenの値は表示しません。</p>
            </div>
            <UiBadge tone={account?.is_connected ? "green" : "slate"}>{account?.connection_status ?? "not_configured"}</UiBadge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <StatusRow label="LINE公式アカウント設定" ok={Boolean(account)} />
            <StatusRow label="Channel ID" ok={Boolean(account?.channel_id)} />
            <StatusRow label="Basic ID" ok={Boolean(account?.basic_id)} />
            <StatusRow label="Channel secret" ok={Boolean(account?.channel_secret_last4)} />
            <StatusRow label="Channel access token" ok={Boolean(account?.channel_access_token_last4)} />
            <StatusRow label="接続確認結果" ok={Boolean(account?.is_connected)} />
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">Webhook URL</p>
            <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{webhookUrl}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
            <span>NODE_ENV: {process.env.NODE_ENV ?? "unknown"}</span>
            <span>company_id: {diagnostics.companyId ? "取得済み" : "未取得"}</span>
          </div>
        </UiCard>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["最新Webhook受信日時", formatDate(diagnostics.latestReceivedAt)],
            ["今日のWebhook受信件数", diagnostics.todayCount],
            ["今日のfollow件数", diagnostics.followCount],
            ["今日のmessage件数", diagnostics.messageCount],
          ].map(([label, value]) => (
            <UiCard key={label} className="p-5">
              <p className="text-xs font-bold text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{display(value)}</p>
            </UiCard>
          ))}
        </section>

        {isDevelopment ? (
          <UiCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">開発環境限定テストイベント</h2>
                <p className="mt-1 text-sm text-slate-500">productionでは非表示です。Token/Secretは使いません。</p>
              </div>
              <UiBadge tone="green">development only</UiBadge>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                ["テストfollowイベント作成", "follow"],
                ["テストmessageイベント作成", "message"],
                ["テストpostbackイベント作成", "postback"],
                ["テストunfollowイベント作成", "unfollow"],
              ].map(([label, eventType]) => (
                <form key={eventType} action={createTestWebhookEvent.bind(null, eventType as "follow" | "message" | "postback" | "unfollow")}>
                  <button type="submit" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">{label}</button>
                </form>
              ))}
            </div>
          </UiCard>
        ) : null}

        <UiCard className="p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">直近10件のWebhookイベント概要</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">受信日時</th>
                  <th className="px-4 py-3">event_type</th>
                  <th className="px-4 py-3">message_type</th>
                  <th className="px-4 py-3">LINE userId</th>
                  <th className="px-4 py-3">source hash</th>
                  <th className="px-4 py-3">event hash</th>
                  <th className="px-4 py-3">status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {diagnostics.events.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center font-bold text-slate-500">データがありません</td></tr>
                ) : diagnostics.events.map((event) => (
                  <tr key={event.id} className="hover:bg-green-50/60">
                    <td className="px-4 py-3">{formatDate(event.received_at)}</td>
                    <td className="px-4 py-3 font-bold">{event.event_type}</td>
                    <td className="px-4 py-3">{display(event.message_type)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{event.line_friend_id ? display(diagnostics.friendMap.get(event.line_friend_id)) : "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{display(event.source_user_hash?.slice(0, 16))}</td>
                    <td className="px-4 py-3 font-mono text-xs">{display(event.raw_event_hash?.slice(0, 16))}</td>
                    <td className="px-4 py-3">{event.status}</td>
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
