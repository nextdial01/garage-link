"use client";

import { useFormStatus } from "react-dom";

type FriendOption = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  friend_status: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {pending ? "送信中..." : "テスト送信する"}
    </button>
  );
}

export function LineTestSendForm({
  friends,
  hasEnvTestUser,
  action,
}: {
  friends: FriendOption[];
  hasEnvTestUser: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form
      action={action}
      className="space-y-4"
      onSubmit={(event) => {
        const ok = window.confirm("選択した1ユーザーにだけテスト送信します。本番一斉配信ではありません。送信しますか？");
        if (!ok) event.preventDefault();
      }}
    >
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
        これはテスト送信です。送信先は環境変数のテストユーザー、またはここで明示選択した1人だけです。broadcast / multicast は使いません。
      </div>
      <label className="block">
        <span className="text-xs font-bold text-slate-500">送信先テストユーザー</span>
        <select name="line_friend_id" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">{hasEnvTestUser ? "環境変数 L_LINK_LINE_TEST_USER_ID を使う" : "送信先を選択"}</option>
          {friends.map((friend) => (
            <option key={friend.id} value={friend.id}>
              {(friend.display_name || friend.line_user_id)} / {friend.friend_status}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-500">テストメッセージ本文</span>
        <textarea
          name="message_text"
          required
          rows={3}
          defaultValue="L-Linkのテスト送信です。"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      <SubmitButton />
    </form>
  );
}
