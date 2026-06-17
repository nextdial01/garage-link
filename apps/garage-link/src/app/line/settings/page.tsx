'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  LineModuleShell,
  StatCards,
  inputClass,
} from '../_components/LineModule';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import LineSecretField from '@/components/line/shared/LineSecretField';
import { canManageLineSettings, getRoleLabel } from '@/lib/auth/permissions';

type SafeLineSettings = FormState & {
  channel_secret_masked: string;
  channel_access_token_masked: string;
  channel_secret_last4: string | null;
  channel_access_token_last4: string | null;
  secret_encrypted: boolean;
  token_encrypted: boolean;
  updated_at: string | null;
};

type LineSettingsApiResponse = {
  ok: boolean;
  error?: string;
  role?: string;
  settings?: SafeLineSettings;
};

type SecretMeta = {
  channel_secret_masked: string;
  channel_access_token_masked: string;
  channel_secret_last4: string | null;
  channel_access_token_last4: string | null;
  secret_encrypted: boolean;
  token_encrypted: boolean;
  updated_at: string | null;
};

type FormState = {
  line_account_name: string;
  basic_id: string;
  channel_id: string;
  webhook_url: string;
  connection_status: string;
  webhook_enabled: string;
  signature_verification_enabled: string;
  default_sender_name: string;
  unsubscribe_message: string;
  friend_add_message: string;
  block_handling: string;
  default_delivery_permission: string;
  quiet_hours_enabled: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  internal_memo: string;
};

const emptyFormState: FormState = {
  line_account_name: '',
  basic_id: '',
  channel_id: '',
  webhook_url: '',
  connection_status: 'not_connected',
  webhook_enabled: 'false',
  signature_verification_enabled: 'true',
  default_sender_name: '',
  unsubscribe_message: '',
  friend_add_message: '',
  block_handling: 'update_customer_status',
  default_delivery_permission: 'true',
  quiet_hours_enabled: 'false',
  quiet_hours_start: '',
  quiet_hours_end: '',
  internal_memo: '',
};

const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const developmentWebhookUrl = 'http://localhost:3000/api/line/webhook';
const productionWebhookUrl = `${appBaseUrl}/api/line/webhook`;

const emptySecretMeta: SecretMeta = {
  channel_secret_masked: '',
  channel_access_token_masked: '',
  channel_secret_last4: null,
  channel_access_token_last4: null,
  secret_encrypted: false,
  token_encrypted: false,
  updated_at: null,
};

function toFormState(row: SafeLineSettings | null | undefined): FormState {
  if (!row) {
    return emptyFormState;
  }

  return {
    line_account_name: row.line_account_name ?? '',
    basic_id: row.basic_id ?? '',
    channel_id: row.channel_id ?? '',
    webhook_url: row.webhook_url ?? '',
    connection_status: row.connection_status || 'not_connected',
    webhook_enabled: row.webhook_enabled || 'false',
    signature_verification_enabled: row.signature_verification_enabled || 'true',
    default_sender_name: row.default_sender_name ?? '',
    unsubscribe_message: row.unsubscribe_message ?? '',
    friend_add_message: row.friend_add_message ?? '',
    block_handling: row.block_handling ?? 'update_customer_status',
    default_delivery_permission: row.default_delivery_permission || 'true',
    quiet_hours_enabled: row.quiet_hours_enabled || 'false',
    quiet_hours_start: row.quiet_hours_start ?? '',
    quiet_hours_end: row.quiet_hours_end ?? '',
    internal_memo: row.internal_memo ?? '',
  };
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function connectionStatusLabel(value: string) {
  switch (value) {
    case 'connected':
      return '接続済み';
    case 'error':
      return 'エラー';
    default:
      return '未接続';
  }
}

function booleanLabel(value: string) {
  return value === 'true' ? '有効' : '無効';
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">
      {children}
    </label>
  );
}

export default function LineSettingsPage() {
  const [role, setRole] = useState('');
  const [formState, setFormState] = useState<FormState>(emptyFormState);
  const [secretMeta, setSecretMeta] = useState(emptySecretMeta);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [webhookTestMessage, setWebhookTestMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const channelSecretRef = useRef<HTMLInputElement>(null);
  const channelAccessTokenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await fetch('/api/line/settings', { cache: 'no-store' });
        const data = (await response.json()) as LineSettingsApiResponse;

        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? 'LINE設定の取得に失敗しました。');
        }

        setRole(data.role ?? '');
        setFormState(toFormState(data.settings));
        setSecretMeta({
          channel_secret_masked: data.settings?.channel_secret_masked ?? '',
          channel_access_token_masked: data.settings?.channel_access_token_masked ?? '',
          channel_secret_last4: data.settings?.channel_secret_last4 ?? null,
          channel_access_token_last4: data.settings?.channel_access_token_last4 ?? null,
          secret_encrypted: Boolean(data.settings?.secret_encrypted),
          token_encrypted: Boolean(data.settings?.token_encrypted),
          updated_at: data.settings?.updated_at ?? null,
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE設定の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadSettings();
  }, []);

  const stats = useMemo(() => {
    return [
      { label: '接続状態', value: connectionStatusLabel(formState.connection_status) },
      { label: 'Webhook', value: booleanLabel(formState.webhook_enabled) },
      { label: '署名検証', value: booleanLabel(formState.signature_verification_enabled) },
      { label: '配信設定', value: formState.default_delivery_permission === 'true' ? '許可' : '不許可' },
    ];
  }, [
    formState.connection_status,
    formState.default_delivery_permission,
    formState.signature_verification_enabled,
    formState.webhook_enabled,
  ]);

  function updateField(field: keyof FormState, value: string) {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSaving(true);

    try {
      if (!canManageLineSettings(role)) {
        throw new Error('この機能を利用する権限がありません。管理者に確認してください。');
      }

      const channelSecret = channelSecretRef.current?.value.trim() ?? '';
      const channelAccessToken = channelAccessTokenRef.current?.value.trim() ?? '';
      const payload = {
        line_account_name: toNullableText(formState.line_account_name),
        basic_id: toNullableText(formState.basic_id),
        channel_id: toNullableText(formState.channel_id),
        channel_secret: channelSecret || null,
        channel_access_token: channelAccessToken || null,
        webhook_url: toNullableText(formState.webhook_url),
        connection_status: formState.connection_status,
        webhook_enabled: formState.webhook_enabled === 'true',
        signature_verification_enabled: formState.signature_verification_enabled === 'true',
        default_sender_name: toNullableText(formState.default_sender_name),
        unsubscribe_message: toNullableText(formState.unsubscribe_message),
        friend_add_message: toNullableText(formState.friend_add_message),
        block_handling: formState.block_handling,
        default_delivery_permission: formState.default_delivery_permission === 'true',
        quiet_hours_enabled: formState.quiet_hours_enabled === 'true',
        quiet_hours_start: toNullableText(formState.quiet_hours_start),
        quiet_hours_end: toNullableText(formState.quiet_hours_end),
        internal_memo: toNullableText(formState.internal_memo),
      };

      const response = await fetch('/api/line/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as LineSettingsApiResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'LINE設定の保存に失敗しました。');
      }

      setFormState(toFormState(data.settings));
      setSecretMeta({
        channel_secret_masked: data.settings?.channel_secret_masked ?? '',
        channel_access_token_masked: data.settings?.channel_access_token_masked ?? '',
        channel_secret_last4: data.settings?.channel_secret_last4 ?? null,
        channel_access_token_last4: data.settings?.channel_access_token_last4 ?? null,
        secret_encrypted: Boolean(data.settings?.secret_encrypted),
        token_encrypted: Boolean(data.settings?.token_encrypted),
        updated_at: data.settings?.updated_at ?? null,
      });
      if (channelSecretRef.current) channelSecretRef.current.value = '';
      if (channelAccessTokenRef.current) channelAccessTokenRef.current.value = '';
      setSuccessMessage('LINE設定を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'LINE設定の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function testWebhookEndpoint() {
    setWebhookTestMessage('');
    setIsTestingWebhook(true);

    try {
      const response = await fetch('/api/line/webhook');
      const data = (await response.json()) as { ok?: boolean; message?: string };
      setWebhookTestMessage(
        data.ok
          ? data.message ?? 'Webhook endpoint is active'
          : 'Webhook疎通確認に失敗しました。'
      );
    } catch (error) {
      setWebhookTestMessage(
        error instanceof Error ? error.message : 'Webhook疎通確認に失敗しました。'
      );
    } finally {
      setIsTestingWebhook(false);
    }
  }

  return (
    <LineModuleShell
      title="LINE設定"
      description="LINE公式アカウント連携・Webhook・配信設定を管理します"
      actionButton={
        <Link
          href="/line"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
        >
          LINE管理へ戻る
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-7xl space-y-8">
        <StatCards stats={stats} />

        {errorMessage && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </p>
        ) : !canManageLineSettings(role) ? (
          <PermissionDeniedCard />
        ) : (
          <>
            <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
              現在の権限: {getRoleLabel(role)}
            </div>
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">LINE公式アカウント設定</h3>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="line_account_name">LINE公式アカウント名</FieldLabel>
                  <input id="line_account_name" type="text" value={formState.line_account_name} onChange={(event) => updateField('line_account_name', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="basic_id">Basic ID</FieldLabel>
                  <input id="basic_id" type="text" value={formState.basic_id} onChange={(event) => updateField('basic_id', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="channel_id">Channel ID</FieldLabel>
                  <input id="channel_id" type="text" value={formState.channel_id} onChange={(event) => updateField('channel_id', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="connection_status">接続状態</FieldLabel>
                  <select id="connection_status" value={formState.connection_status} onChange={(event) => updateField('connection_status', event.target.value)} className={inputClass}>
                    <option value="not_connected">未接続</option>
                    <option value="connected">接続済み</option>
                    <option value="error">エラー</option>
                  </select>
                </div>
                <LineSecretField
                  id="channel_secret"
                  ref={channelSecretRef}
                  label="Channel Secret"
                  maskedValue={secretMeta.channel_secret_masked}
                  inputClassName={inputClass}
                />
                <LineSecretField
                  id="channel_access_token"
                  ref={channelAccessTokenRef}
                  label="Channel Access Token"
                  maskedValue={secretMeta.channel_access_token_masked}
                  inputClassName={inputClass}
                />
                <div className="md:col-span-2">
                  <FieldLabel htmlFor="webhook_url">Webhook URL</FieldLabel>
                  <input id="webhook_url" type="text" value={formState.webhook_url} onChange={(event) => updateField('webhook_url', event.target.value)} placeholder={developmentWebhookUrl} className={inputClass} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">Webhook設定</h3>
                <p className="mt-1 text-sm text-slate-500">
                  LINE DevelopersのWebhook URLに設定してください。
                </p>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <FieldLabel htmlFor="current_webhook_url">現在のWebhook URL</FieldLabel>
                  <input id="current_webhook_url" type="text" value={formState.webhook_url || developmentWebhookUrl} readOnly className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="development_webhook_url">開発中URL</FieldLabel>
                  <input id="development_webhook_url" type="text" value={developmentWebhookUrl} readOnly className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="production_webhook_url">本番想定URL</FieldLabel>
                  <input id="production_webhook_url" type="text" value={productionWebhookUrl} readOnly className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="webhook_enabled">Webhook有効化</FieldLabel>
                  <select id="webhook_enabled" value={formState.webhook_enabled} onChange={(event) => updateField('webhook_enabled', event.target.value)} className={inputClass}>
                    <option value="true">有効</option>
                    <option value="false">無効</option>
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="signature_verification_enabled">署名検証</FieldLabel>
                  <select id="signature_verification_enabled" value={formState.signature_verification_enabled} onChange={(event) => updateField('signature_verification_enabled', event.target.value)} className={inputClass}>
                    <option value="true">有効</option>
                    <option value="false">無効</option>
                  </select>
                </div>
              </div>
              <div className="border-t border-slate-100 px-5 pb-6 sm:px-6">
                <button
                  type="button"
                  onClick={() => void testWebhookEndpoint()}
                  disabled={isTestingWebhook}
                  className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-bold text-green-700 transition hover:bg-green-100"
                >
                  {isTestingWebhook ? '確認中...' : 'Webhook疎通確認'}
                </button>
                {webhookTestMessage && (
                  <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    {webhookTestMessage}
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">配信基本設定</h3>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="default_sender_name">デフォルト配信名</FieldLabel>
                  <input id="default_sender_name" type="text" value={formState.default_sender_name} onChange={(event) => updateField('default_sender_name', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="block_handling">ブロック時の処理</FieldLabel>
                  <select id="block_handling" value={formState.block_handling} onChange={(event) => updateField('block_handling', event.target.value)} className={inputClass}>
                    <option value="update_customer_status">顧客ステータスをブロックに変更</option>
                    <option value="none">何もしない</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <FieldLabel htmlFor="unsubscribe_message">配信停止時の案内文</FieldLabel>
                  <textarea id="unsubscribe_message" rows={4} value={formState.unsubscribe_message} onChange={(event) => updateField('unsubscribe_message', event.target.value)} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel htmlFor="friend_add_message">友だち追加時メッセージ</FieldLabel>
                  <textarea id="friend_add_message" rows={4} value={formState.friend_add_message} onChange={(event) => updateField('friend_add_message', event.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">配信制御</h3>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="default_delivery_permission">デフォルト配信許可</FieldLabel>
                  <select id="default_delivery_permission" value={formState.default_delivery_permission} onChange={(event) => updateField('default_delivery_permission', event.target.value)} className={inputClass}>
                    <option value="true">許可</option>
                    <option value="false">不許可</option>
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="quiet_hours_enabled">夜間配信制限</FieldLabel>
                  <select id="quiet_hours_enabled" value={formState.quiet_hours_enabled} onChange={(event) => updateField('quiet_hours_enabled', event.target.value)} className={inputClass}>
                    <option value="true">有効</option>
                    <option value="false">無効</option>
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="quiet_hours_start">配信停止開始時刻</FieldLabel>
                  <input id="quiet_hours_start" type="time" value={formState.quiet_hours_start} onChange={(event) => updateField('quiet_hours_start', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="quiet_hours_end">配信停止終了時刻</FieldLabel>
                  <input id="quiet_hours_end" type="time" value={formState.quiet_hours_end} onChange={(event) => updateField('quiet_hours_end', event.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">社内メモ</h3>
              </div>
              <div className="px-5 py-6 sm:px-6">
                <FieldLabel htmlFor="internal_memo">internal_memo</FieldLabel>
                <textarea id="internal_memo" rows={5} value={formState.internal_memo} onChange={(event) => updateField('internal_memo', event.target.value)} className={inputClass} />
              </div>
            </section>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
              <Link
                href="/line"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
              >
                LINE管理へ戻る
              </Link>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? '保存中...' : '保存する'}
              </button>
            </div>
          </>
        )}

        <p className="text-xs text-slate-500">
          TODO: LINE userId自動紐付け、友だち追加時の自動返信、配信対象抽出は後工程で実装します。
        </p>
      </form>
    </LineModuleShell>
  );
}
