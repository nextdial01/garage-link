'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type SettingsRow = {
  sales_account_name: string;
  receivable_account_name: string;
  suspense_account_name: string;
  output_tax_account_name: string;
};

type FormatKey = 'yayoi' | 'moneyforward';

const allowedRoles = ['owner', 'admin'];

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const defaultSettings: SettingsRow = {
  sales_account_name: '売上高',
  receivable_account_name: '売掛金',
  suspense_account_name: '預り金',
  output_tax_account_name: '仮受消費税等',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function AccountingExportSettingsPage() {
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [settings, setSettings] = useState<SettingsRow>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [format, setFormat] = useState<FormatKey>('yayoi');
  const [from, setFrom] = useState(firstDayOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user?.id) {
          setHasPermission(false);
          return;
        }

        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();

        if (!member?.store_id || !allowedRoles.includes(member.role ?? '')) {
          setHasPermission(false);
          return;
        }

        setStoreId(member.store_id);
        setHasPermission(true);

        const { data: settingsRow } = await supabase
          .from<SettingsRow>('accounting_export_settings')
          .select('sales_account_name, receivable_account_name, suspense_account_name, output_tax_account_name')
          .eq('store_id', member.store_id)
          .maybeSingle();

        if (settingsRow) {
          setSettings(settingsRow);
        }
      } catch {
        setHasPermission(false);
      } finally {
        setIsCheckingPermission(false);
      }
    }

    void load();
  }, []);

  async function handleSave() {
    try {
      setIsSaving(true);
      setMessage('');
      setErrorMessage('');
      const supabase = createClient();
      const { error } = await supabase
        .from<SettingsRow & { store_id: string }>('accounting_export_settings')
        .upsert({ store_id: storeId, ...settings }, { onConflict: 'store_id' });

      if (error) throw new Error(error.message);
      setMessage('勘定科目名を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport() {
    try {
      setIsExporting(true);
      setMessage('');
      setErrorMessage('');

      const params = new URLSearchParams({ format, from, to });
      const response = await fetch(`/api/accounting-export?${params.toString()}`, { method: 'GET' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? '出力に失敗しました。');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `garage-link-journal-${format}-${from}_${to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('CSVをダウンロードしました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '出力に失敗しました。');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <AppShell
      activeLabel="車両管理設定"
      title="会計ソフト連携（CSV出力）"
      description="発行済み請求書を freee / 弥生会計 / マネーフォワード クラウド会計 で取り込めるCSV形式で出力します。"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      {isCheckingPermission ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
          権限を確認しています...
        </section>
      ) : !hasPermission ? (
        <PermissionDeniedCard />
      ) : (
        <div className="space-y-6">
          {(message || errorMessage) && (
            <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${errorMessage ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
              {errorMessage || message}
            </div>
          )}

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800 shadow-sm sm:p-6">
            出力される仕訳は簡易的な参考値です。自賠責保険・重量税・印紙代・リサイクル預託金は売上ではなく預り金として計上し、
            それ以外の項目は課税売上として消費税額を分割しています。実際の帳簿への反映前に、必ず顧問税理士・会計事務所に内容をご確認ください。
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-950">勘定科目名の設定</h3>
            <p className="mt-1 text-sm text-slate-500">お使いの会計ソフトの勘定科目名に合わせて調整してください（未設定時は既定値を使用します）。</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">売上高（課税売上の貸方科目）</span>
                <input
                  type="text"
                  value={settings.sales_account_name}
                  onChange={(event) => setSettings((current) => ({ ...current, sales_account_name: event.target.value }))}
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">売掛金（借方科目）</span>
                <input
                  type="text"
                  value={settings.receivable_account_name}
                  onChange={(event) => setSettings((current) => ({ ...current, receivable_account_name: event.target.value }))}
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">預り金（自賠責保険・重量税・印紙代・リサイクル預託金の貸方科目）</span>
                <input
                  type="text"
                  value={settings.suspense_account_name}
                  onChange={(event) => setSettings((current) => ({ ...current, suspense_account_name: event.target.value }))}
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">仮受消費税等</span>
                <input
                  type="text"
                  value={settings.output_tax_account_name}
                  onChange={(event) => setSettings((current) => ({ ...current, output_tax_account_name: event.target.value }))}
                  className={`${inputClass} mt-2`}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? '保存中...' : '勘定科目名を保存'}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-slate-950">CSV出力</h3>
            <p className="mt-1 text-sm text-slate-500">指定期間内に発行済みの請求書を仕訳CSVとして出力します。</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">出力形式</span>
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as FormatKey)}
                  className={`${inputClass} mt-2`}
                >
                  <option value="yayoi">弥生会計 / freee（弥生形式）</option>
                  <option value="moneyforward">マネーフォワード クラウド会計</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">開始日</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-2`} />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-slate-700">終了日</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-2`} />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? '出力中...' : 'CSVをダウンロード'}
            </button>
          </section>
        </div>
      )}
    </AppShell>
  );
}
