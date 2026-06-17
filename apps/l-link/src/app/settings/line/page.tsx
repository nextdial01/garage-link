import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { encryptSecret, getLast4, decryptSecret, hasEncryptionKey } from "@/lib/line/encryption";
import { createLLinkServiceClient, getCurrentLLinkCompany, getPrimaryLineAccount } from "@/lib/supabase/server";
import { listTestMessageFriends, sendLineTestMessage } from "@/lib/line/sendTestMessage";
import { LineSettingsForm } from "./LineSettingsForm";
import { LineTestSendForm } from "./LineTestSendForm";
import type { LineSettingsFields, LineSettingsState } from "./types";

function appUrl() {
  return process.env.L_LINK_WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
}

const lineAccountSelect =
  "id, company_id, account_name, channel_id, basic_id, line_bot_user_id, webhook_url, is_connected, connection_status, verified_at, last_connection_error, channel_secret_last4, channel_access_token_last4";

type LineAccountForSettings = {
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

function fieldsFromAccount(account: LineAccountForSettings | null | undefined, webhookUrl: string): LineSettingsFields {
  return {
    accountId: account?.id ?? "",
    accountName: account?.account_name ?? "",
    channelId: account?.channel_id ?? "",
    basicId: account?.basic_id ?? "",
    lineBotUserId: account?.line_bot_user_id ?? "",
    webhookUrl: account?.webhook_url ?? webhookUrl,
  };
}

function stateFromAccount(
  account: LineAccountForSettings | null | undefined,
  webhookUrl: string,
  status: LineSettingsState["status"] = "idle",
  message = "",
): LineSettingsState {
  return {
    status,
    message,
    fields: fieldsFromAccount(account, webhookUrl),
    secrets: {
      channelSecretConfigured: Boolean(account?.channel_secret_last4),
      channelAccessTokenConfigured: Boolean(account?.channel_access_token_last4),
    },
    connectionStatus: account?.connection_status ?? "not_configured",
    isConnected: Boolean(account?.is_connected),
    verifiedAt: account?.verified_at ?? null,
    lastConnectionError: account?.last_connection_error ?? null,
  };
}

function fieldsFromForm(formData: FormData): LineSettingsFields {
  return {
    accountId: String(formData.get("account_id") ?? ""),
    accountName: String(formData.get("account_name") ?? "").trim(),
    channelId: String(formData.get("channel_id") ?? "").trim(),
    basicId: String(formData.get("basic_id") ?? "").trim(),
    lineBotUserId: String(formData.get("line_bot_user_id") ?? "").trim(),
    webhookUrl: String(formData.get("webhook_url") ?? "").trim(),
  };
}

function errorState(prevState: LineSettingsState, fields: LineSettingsFields, message: string): LineSettingsState {
  return {
    ...prevState,
    status: "error",
    message,
    fields,
  };
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function safeErrorDetail(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ? `${error.code} / ` : "";
  const message = error?.message ?? "unknown error";
  return `${code}${message}`.slice(0, 220);
}

function canEditLineSettings(role?: string | null, source?: string) {
  if (source === "demo_env") return true;
  return role === "owner" || role === "admin" || role === "staff";
}

function saveErrorMessage(error: { code?: string; message?: string } | null | undefined, operation = "ll_line_accounts save failed") {
  if (!error) return "保存に失敗しました";
  if (error.code === "42501") {
    if (isDevelopment()) {
      return `${operation}: permission denied。service_role に ll_line_accounts への権限が付与されていない、またはRLS/role設定が不足している可能性があります（${safeErrorDetail(error)}）`;
    }
    return "保存に失敗しました：権限がありません";
  }
  if (error.code === "23505") return "保存に失敗しました：同じLINE公式アカウント設定が既に存在します";
  if (isDevelopment()) return `${operation}: ${safeErrorDetail(error)}`;
  return "保存に失敗しました：Supabaseへの保存に失敗しました";
}

function configuredText(configured: boolean) {
  return configured ? "設定済み" : "未設定";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未受信";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function getLineRuntimeStatus(companyId?: string | null) {
  const supabase = createLLinkServiceClient();
  if (!supabase || !companyId) {
    return {
      latestWebhookReceivedAt: null as string | null,
      latestWebhookEventType: null as string | null,
      inboundMessageCount: 0,
    };
  }

  const [{ data: latest }, { count }] = await Promise.all([
    supabase
      .from("ll_line_webhook_events")
      .select("event_type, received_at")
      .eq("company_id", companyId)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ll_message_logs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("direction", "inbound"),
  ]);

  return {
    latestWebhookReceivedAt: (latest as { received_at?: string } | null)?.received_at ?? null,
    latestWebhookEventType: (latest as { event_type?: string } | null)?.event_type ?? null,
    inboundMessageCount: count ?? 0,
  };
}

async function saveLineSettings(prevState: LineSettingsState, formData: FormData): Promise<LineSettingsState> {
  "use server";

  const supabase = createLLinkServiceClient();
  const currentCompany = await getCurrentLLinkCompany();
  const companyId = currentCompany?.companyId ?? null;
  const fields = fieldsFromForm(formData);

  if (!companyId) {
    return errorState(prevState, fields, "保存に失敗しました：会社/店舗情報が未作成です。初期設定を行ってください");
  }

  if (!supabase) {
    return errorState(prevState, fields, "保存に失敗しました：service role key missing。サーバー側のSupabase接続設定を確認してください");
  }

  if (!canEditLineSettings(currentCompany?.role, currentCompany?.source)) {
    const role = currentCompany?.role ?? "未設定";
    const message = isDevelopment()
      ? `保存に失敗しました：current user role is ${role}。LINE接続設定はowner/admin/staffのみ保存できます`
      : "保存に失敗しました：権限がありません";
    return errorState(prevState, fields, message);
  }

  const channelSecret = String(formData.get("channel_secret") ?? "").trim();
  const channelAccessToken = String(formData.get("channel_access_token") ?? "").trim();
  const now = new Date().toISOString();
  const secretInputProvided = Boolean(channelSecret || channelAccessToken);
  const encryptionReady = hasEncryptionKey();

  const payload: Record<string, string | boolean | null> = {
    company_id: companyId,
    account_name: fields.accountName,
    channel_id: fields.channelId,
    basic_id: fields.basicId,
    line_bot_user_id: fields.lineBotUserId,
    webhook_url: fields.webhookUrl,
    is_connected: false,
    connection_status: "configured",
    last_connection_error: null,
    updated_at: now,
  };

  if (secretInputProvided && !encryptionReady) {
    return errorState(prevState, fields, "保存に失敗しました：暗号化キーが未設定です（encryption_key_missing）");
  } else {
    if (channelSecret) {
      payload.channel_secret_encrypted = encryptSecret(channelSecret);
      payload.channel_secret_last4 = getLast4(channelSecret);
    }

    if (channelAccessToken) {
      payload.channel_access_token_encrypted = encryptSecret(channelAccessToken);
      payload.channel_access_token_last4 = getLast4(channelAccessToken);
    }
  }

  let savedAccount: LineAccountForSettings | null = null;

  if (fields.accountId) {
    const { data, error } = await supabase
      .from("ll_line_accounts")
      .update(payload)
      .eq("company_id", companyId)
      .eq("id", fields.accountId)
      .select(lineAccountSelect)
      .maybeSingle();

    if (error) {
      return errorState(prevState, fields, saveErrorMessage(error, "ll_line_accounts update failed"));
    }

    if (!data) {
      return errorState(prevState, fields, "保存に失敗しました：対象のLINE公式アカウント設定が見つかりません");
    }

    savedAccount = data as LineAccountForSettings;
  } else {
    const { data, error } = await supabase
      .from("ll_line_accounts")
      .insert({ ...payload, created_at: now })
      .select(lineAccountSelect)
      .single();

    if (error) {
      return errorState(prevState, fields, saveErrorMessage(error, "ll_line_accounts insert failed"));
    }

    savedAccount = data as LineAccountForSettings;
  }

  revalidatePath("/settings/line");

  return stateFromAccount(savedAccount, fields.webhookUrl, "success", "保存しました");
}

async function verifyLineConnection(formData: FormData) {
  "use server";

  const supabase = createLLinkServiceClient();
  const currentCompany = await getCurrentLLinkCompany();
  const companyId = currentCompany?.companyId ?? null;
  const accountId = String(formData.get("account_id") ?? "");
  if (!supabase || !companyId || !accountId) return;

  const { data: account } = await supabase
    .from("ll_line_accounts")
    .select("channel_access_token_encrypted")
    .eq("company_id", companyId)
    .eq("id", accountId)
    .maybeSingle();

  try {
    const token = decryptSecret(account?.channel_access_token_encrypted);
    if (!token) throw new Error("token_missing");

    const response = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`line_api_${response.status}`);
    }

    await supabase
      .from("ll_line_accounts")
      .update({
        is_connected: true,
        connection_status: "verified",
        verified_at: new Date().toISOString(),
        last_connection_error: null,
      })
      .eq("company_id", companyId)
      .eq("id", accountId);
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 80) : "connection_failed";
    await supabase
      .from("ll_line_accounts")
      .update({
        is_connected: false,
        connection_status: "failed",
        last_connection_error: errorCode,
      })
      .eq("company_id", companyId)
      .eq("id", accountId);
  }

  revalidatePath("/settings/line");
}

async function sendTestMessageAction(formData: FormData) {
  "use server";

  const result = await sendLineTestMessage({
    lineFriendId: String(formData.get("line_friend_id") ?? "").trim() || null,
    messageText: String(formData.get("message_text") ?? ""),
  });

  revalidatePath("/settings/line");
  revalidatePath("/line/messages");
  const params = new URLSearchParams({
    test_send_status: result.ok ? "success" : "error",
    test_send_message: result.message,
  });
  redirect(`/settings/line?${params.toString()}`);
}

export default async function LineSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const testSendStatus = typeof resolvedSearchParams.test_send_status === "string" ? resolvedSearchParams.test_send_status : "";
  const testSendMessage = typeof resolvedSearchParams.test_send_message === "string" ? resolvedSearchParams.test_send_message : "";
  const currentCompany = await getCurrentLLinkCompany();
  const account = (await getPrimaryLineAccount(currentCompany?.companyId)) as LineAccountForSettings | null;
  const webhookUrl = account?.webhook_url ?? `${appUrl().replace(/\/$/, "")}/api/line/webhook`;
  const encryptionReady = hasEncryptionKey();
  const initialState = stateFromAccount(account, webhookUrl);
  const runtimeStatus = await getLineRuntimeStatus(currentCompany?.companyId);
  const testFriends = await listTestMessageFriends();
  const hasEnvTestUser = Boolean(process.env.L_LINK_LINE_TEST_USER_ID);

  return (
    <LLinkShell title="LINE接続" description="LINE公式アカウントの接続情報とWebhook URLを管理します。">
      <div className="space-y-5">
        <UiCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">接続状態</h2>
              <p className="mt-1 text-sm text-slate-500">Secret / Tokenは保存済みでも平文表示しません。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UiBadge tone={account?.is_connected ? "green" : "slate"}>{account?.connection_status ?? "not_configured"}</UiBadge>
              <Link href="/settings/line/diagnostics" className="rounded-xl border border-green-200 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-50">
                診断ページ
              </Link>
            </div>
          </div>
          <dl className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">Channel secret</dt>
              <dd className="mt-1 font-bold">{configuredText(Boolean(account?.channel_secret_last4))}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">Channel access token</dt>
              <dd className="mt-1 font-bold">{configuredText(Boolean(account?.channel_access_token_last4))}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">最終確認</dt>
              <dd className="mt-1 font-bold">{account?.verified_at ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(account.verified_at)) : "未確認"}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">Webhook最終受信</dt>
              <dd className="mt-1 font-bold">{formatDate(runtimeStatus.latestWebhookReceivedAt)}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">最後のイベント種別</dt>
              <dd className="mt-1 font-bold">{runtimeStatus.latestWebhookEventType ?? "未受信"}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">受信メッセージログ</dt>
              <dd className="mt-1 font-bold">{runtimeStatus.inboundMessageCount}件</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">テストユーザーID</dt>
              <dd className="mt-1 font-bold">{hasEnvTestUser ? "環境変数で設定済み" : "未設定"}</dd>
            </div>
          </dl>
          {!encryptionReady ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              暗号化キーが未設定です。Channel secret / Channel access token を保存する前に L_LINK_APP_ENCRYPTION_KEY または APP_ENCRYPTION_KEY を設定してください。
            </p>
          ) : null}
          {account?.last_connection_error ? (
            <p className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">
              接続確認または保存に失敗しました: {account.last_connection_error}
            </p>
          ) : null}
        </UiCard>

        {!currentCompany?.companyId ? (
          <UiCard>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">
              <p>会社/店舗情報が未作成です。L-Linkを利用するには、先に会社・店舗とメンバー所属の初期設定を行ってください。</p>
              <Link href="/settings/organization" className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-black text-white hover:bg-orange-700">
                会社・店舗設定へ進む
              </Link>
            </div>
          </UiCard>
        ) : null}

        <UiCard>
          <h2 className="text-lg font-black">LINE公式アカウント接続設定</h2>
          <div className="mt-5">
            <LineSettingsForm initialState={initialState} saveAction={saveLineSettings} />
          </div>

          {account?.id ? (
            <form action={verifyLineConnection} className="mt-3">
              <input type="hidden" name="account_id" value={account.id} />
              <button className="rounded-xl border border-green-200 px-5 py-2 text-sm font-bold text-green-700 hover:bg-green-50">接続確認</button>
            </form>
          ) : null}
        </UiCard>

        <UiCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">単体テスト送信</h2>
              <p className="mt-1 text-sm text-slate-500">送信先を1人に限定した確認用です。本番一斉配信ではありません。</p>
            </div>
            <UiBadge tone="slate">broadcast / multicast 未実装</UiBadge>
          </div>
          {testSendMessage ? (
            <div
              className={
                testSendStatus === "success"
                  ? "mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700"
                  : "mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
              }
            >
              {testSendMessage}
            </div>
          ) : null}
          <div className="mt-5">
            <LineTestSendForm friends={testFriends} hasEnvTestUser={hasEnvTestUser} action={sendTestMessageAction} />
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
