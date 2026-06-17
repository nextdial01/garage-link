"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/CopyButton";
import type { LineSettingsState } from "./types";

type SaveLineSettingsAction = (
  prevState: LineSettingsState,
  formData: FormData,
) => Promise<LineSettingsState>;

type LineSettingsFormProps = {
  initialState: LineSettingsState;
  saveAction: SaveLineSettingsAction;
};

function configuredText(configured: boolean) {
  return configured ? "設定済み" : "未設定";
}

export function LineSettingsForm({ initialState, saveAction }: LineSettingsFormProps) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const fields = state.fields;
  const formKey = [
    state.status,
    state.message,
    fields.accountId,
    fields.accountName,
    fields.channelId,
    fields.basicId,
    fields.lineBotUserId,
    fields.webhookUrl,
  ].join(":");

  return (
    <div className="space-y-4">
      {state.message ? (
        <p
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            state.status === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-3">
        <div>
          <p className="text-xs font-bold text-slate-500">Channel secret</p>
          <p className="mt-1 text-sm font-black text-slate-900">{configuredText(state.secrets.channelSecretConfigured)}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500">Channel access token</p>
          <p className="mt-1 text-sm font-black text-slate-900">{configuredText(state.secrets.channelAccessTokenConfigured)}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500">保存状態</p>
          <p className="mt-1 text-sm font-black text-slate-900">{state.connectionStatus || "not_configured"}</p>
        </div>
      </div>

      <form key={formKey} action={formAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="account_id" value={fields.accountId} />
        <label className="block">
          <span className="text-xs font-bold text-slate-500">LINE公式アカウント名</span>
          <input
            name="account_name"
            defaultValue={fields.accountName}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">Channel ID</span>
          <input
            name="channel_id"
            defaultValue={fields.channelId}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">Basic ID</span>
          <input
            name="basic_id"
            defaultValue={fields.basicId}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">LINE Bot User ID / destination</span>
          <input
            name="line_bot_user_id"
            defaultValue={fields.lineBotUserId}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-500">Webhook URL</span>
          <div className="mt-1 flex flex-col gap-2 md:flex-row">
            <input
              name="webhook_url"
              defaultValue={fields.webhookUrl}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <CopyButton value={fields.webhookUrl} />
          </div>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">Channel secret</span>
          <input
            name="channel_secret"
            type="password"
            placeholder="変更する場合のみ入力"
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">Channel access token</span>
          <input
            name="channel_access_token"
            type="password"
            placeholder="変更する場合のみ入力"
            autoComplete="off"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <button disabled={pending} className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {pending ? "保存中" : "保存する"}
          </button>
          <p className="text-xs font-bold text-slate-500">Secret / Token は保存後も本文を表示しません。</p>
        </div>
      </form>
    </div>
  );
}
