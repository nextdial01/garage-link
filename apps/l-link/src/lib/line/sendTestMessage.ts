import "server-only";
import { createLLinkServiceClient, getCurrentLLinkCompany } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/line/encryption";
import { sha256Hex } from "@/lib/line/security";

export type TestSendResult = {
  ok: boolean;
  message: string;
};

type TestFriend = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  friend_status: string;
};

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function canSendTestMessage(role?: string | null, source?: string) {
  if (source === "demo_env") return true;
  return role === "owner" || role === "admin" || role === "staff";
}

function safeLineApiError(status: number) {
  return `line_api_${status}`;
}

export async function listTestMessageFriends() {
  const supabase = createLLinkServiceClient();
  const currentCompany = await getCurrentLLinkCompany();
  const companyId = currentCompany?.companyId ?? null;

  if (!supabase || !companyId) return [];

  const { data } = await supabase
    .from("ll_line_friends")
    .select("id, line_user_id, display_name, friend_status")
    .eq("company_id", companyId)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(100);

  return (data ?? []) as TestFriend[];
}

export async function sendLineTestMessage(input: {
  lineFriendId?: string | null;
  messageText: string;
}): Promise<TestSendResult> {
  const supabase = createLLinkServiceClient();
  const currentCompany = await getCurrentLLinkCompany();
  const companyId = currentCompany?.companyId ?? null;

  if (!supabase) return { ok: false, message: "テスト送信に失敗しました：service role key missing" };
  if (!companyId) return { ok: false, message: "テスト送信に失敗しました：company_id missing" };
  if (!canSendTestMessage(currentCompany?.role, currentCompany?.source)) {
    return { ok: false, message: "テスト送信に失敗しました：権限がありません" };
  }

  const messageText = input.messageText.trim();
  if (!messageText) return { ok: false, message: "テスト送信に失敗しました：メッセージ本文を入力してください" };

  const { data: account } = await supabase
    .from("ll_line_accounts")
    .select("id, channel_access_token_encrypted")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!account?.id) return { ok: false, message: "テスト送信に失敗しました：LINE公式アカウント設定がありません" };

  const envTestUserId = process.env.L_LINK_LINE_TEST_USER_ID?.trim() || null;
  let targetFriend: TestFriend | null = null;

  if (input.lineFriendId) {
    const { data: friend } = await supabase
      .from("ll_line_friends")
      .select("id, line_user_id, display_name, friend_status")
      .eq("company_id", companyId)
      .eq("id", input.lineFriendId)
      .maybeSingle();
    targetFriend = (friend as TestFriend | null) ?? null;
  } else if (envTestUserId) {
    const { data: friend } = await supabase
      .from("ll_line_friends")
      .select("id, line_user_id, display_name, friend_status")
      .eq("company_id", companyId)
      .eq("line_user_id", envTestUserId)
      .maybeSingle();
    targetFriend = (friend as TestFriend | null) ?? {
      id: "",
      line_user_id: envTestUserId,
      display_name: null,
      friend_status: "env_test_user",
    };
  }

  if (!targetFriend?.line_user_id) {
    return { ok: false, message: "テスト送信に失敗しました：送信先テストユーザーを選択してください" };
  }

  if (envTestUserId && targetFriend.line_user_id !== envTestUserId) {
    return { ok: false, message: "テスト送信に失敗しました：環境変数のテストユーザー以外には送信できません" };
  }

  const tokenFromDb = decryptSecret((account as { channel_access_token_encrypted?: string | null }).channel_access_token_encrypted);
  const channelAccessToken = tokenFromDb ?? process.env.L_LINK_LINE_CHANNEL_ACCESS_TOKEN ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
  if (!channelAccessToken) {
    return { ok: false, message: "テスト送信に失敗しました：Channel access token が設定されていません" };
  }

  const now = new Date().toISOString();
  let status = "sent";
  let resultMessage = "テスト送信を実行しました";

  try {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: targetFriend.line_user_id,
        messages: [{ type: "text", text: messageText }],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      status = "failed";
      resultMessage = isDevelopment()
        ? `テスト送信に失敗しました：${safeLineApiError(response.status)}`
        : "テスト送信に失敗しました：LINE APIでエラーが発生しました";
    }
  } catch {
    status = "failed";
    resultMessage = "テスト送信に失敗しました：LINE APIへ接続できませんでした";
  }

  await supabase.from("ll_message_logs").insert({
    company_id: companyId,
    line_account_id: account.id,
    line_friend_id: targetFriend.id || null,
    direction: "outbound_test",
    message_type: "text",
    message_body: messageText,
    message_hash: sha256Hex(messageText),
    sent_at: now,
    status,
  });

  return {
    ok: status === "sent",
    message: resultMessage,
  };
}
