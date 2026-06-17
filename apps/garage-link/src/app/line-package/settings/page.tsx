'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import LineSecretField from '@/components/line/shared/LineSecretField';
import LinePackageShell from '@/components/line-package/LinePackageShell';

type SafeLineSettings = {
  basic_id: string;
  channel_id: string;
  webhook_url: string;
  connection_status: string;
  channel_secret_masked: string;
  channel_access_token_masked: string;
  updated_at: string | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  settings?: SafeLineSettings;
};

const emptySettings: SafeLineSettings = {
  basic_id: '',
  channel_id: '',
  webhook_url: '',
  connection_status: 'not_connected',
  channel_secret_masked: '',
  channel_access_token_masked: '',
  updated_at: null,
};

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-green-400 focus:ring-4 focus:ring-green-100';

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

export default function LinePackageSettingsPage() {
  const [settings, setSettings] = useState<SafeLineSettings>(emptySettings);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const secretRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const response = await fetch('/api/line/settings', { cache: 'no-store' });
        const data = (await response.json()) as ApiResponse;
        if (!response.ok || !data.ok) throw new Error(data.error ?? 'LINE設定の取得に失敗しました。');
        setSettings(data.settings ?? emptySettings);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE設定の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadSettings();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/line/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basic_id: settings.basic_id || null,
          channel_id: settings.channel_id || null,
          webhook_url: settings.webhook_url || null,
          connection_status: settings.connection_status,
          channel_secret: secretRef.current?.value.trim() || null,
          channel_access_token: tokenRef.current?.value.trim() || null,
        }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'LINE設定の保存に失敗しました。');

      setSettings(data.settings ?? emptySettings);
      if (secretRef.current) secretRef.current.value = '';
      if (tokenRef.current) tokenRef.current.value = '';
      setSuccessMessage('LINE設定を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'LINE設定の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <LinePackageShell
      title="LINE設定"
      description="LINE単体パッケージの公式アカウント連携情報を管理します。Secret/Tokenは平文表示しません。"
    >
      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">
        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {successMessage && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}
        {isLoading ? (
          <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">読み込み中...</p>
        ) : (
          <section className="rounded-2xl border border-green-100 bg-white shadow-sm">
            <div className="border-b border-green-50 p-5">
              <h2 className="text-lg font-bold text-slate-950">LINE公式アカウント設定</h2>
              <p className="mt-1 text-sm text-slate-500">LINE単体パッケージでは車両・商談・帳票設定は扱いません。</p>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-inset ring-green-100">
                <p className="text-xs font-bold text-green-700">接続状態</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{settings.connection_status || 'not_connected'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-100">
                <p className="text-xs font-bold text-slate-500">最終更新日時</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{formatDateTime(settings.updated_at)}</p>
              </div>
              <div>
                <label htmlFor="basic_id" className="mb-2 block text-sm font-bold text-slate-700">Basic ID</label>
                <input id="basic_id" value={settings.basic_id} onChange={(event) => setSettings((current) => ({ ...current, basic_id: event.target.value }))} className={inputClass} />
              </div>
              <div>
                <label htmlFor="channel_id" className="mb-2 block text-sm font-bold text-slate-700">Channel ID</label>
                <input id="channel_id" value={settings.channel_id} onChange={(event) => setSettings((current) => ({ ...current, channel_id: event.target.value }))} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="webhook_url" className="mb-2 block text-sm font-bold text-slate-700">Webhook URL</label>
                <input id="webhook_url" value={settings.webhook_url} onChange={(event) => setSettings((current) => ({ ...current, webhook_url: event.target.value }))} className={inputClass} />
              </div>
              <LineSecretField
                id="line_package_channel_secret"
                ref={secretRef}
                label="Channel Secret"
                maskedValue={settings.channel_secret_masked}
                inputClassName={inputClass}
              />
              <LineSecretField
                id="line_package_channel_access_token"
                ref={tokenRef}
                label="Channel Access Token"
                maskedValue={settings.channel_access_token_masked}
                inputClassName={inputClass}
              />
            </div>
            <div className="flex justify-end border-t border-green-50 p-5">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? '保存中...' : '保存する'}
              </button>
            </div>
          </section>
        )}
      </form>
    </LinePackageShell>
  );
}
