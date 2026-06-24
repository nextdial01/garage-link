'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_TIMINGS,
  MAX_OFFSET_DAYS,
  MIN_OFFSET_DAYS,
  validateTimings,
  type ReminderSettings,
  type ReminderTiming,
} from '@/lib/inspection-reminders/shared';

const emptySettings: ReminderSettings = {
  enabled: false,
  exclude_sold: true,
  exclude_scrapped: true,
  exclude_reserved_or_in_service: true,
  require_customer_link: true,
  timings: DEFAULT_TIMINGS,
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export default function InspectionReminderSettingsPage() {
  const [role, setRole] = useState('');
  const [settings, setSettings] = useState<ReminderSettings>(emptySettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canManage = role === 'owner' || role === 'admin';

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user?.id) {
          const { data: member } = await supabase.from<{ role: string | null }>('store_members').select('role').eq('user_id', userData.user.id).single();
          setRole(member?.role ?? '');
        }
        const response = await fetch('/api/customer-follow-up/inspection-reminders/settings', { cache: 'no-store' });
        const data = (await response.json()) as { ok: boolean; settings?: ReminderSettings; error?: string };
        if (response.ok && data.ok && data.settings) {
          setSettings(data.settings);
        } else if (response.status !== 403) {
          setErrorMessage(data.error ?? '設定の取得に失敗しました。');
        }
      } catch {
        setErrorMessage('設定の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const sortedTimings = useMemo(
    () => [...settings.timings].sort((a, b) => a.offset_days - b.offset_days),
    [settings.timings]
  );

  function updateTiming(index: number, patch: Partial<ReminderTiming>) {
    setSettings((current) => {
      const next = [...current.timings];
      next[index] = { ...next[index], ...patch };
      return { ...current, timings: next };
    });
  }

  function addTiming() {
    setSettings((current) => ({ ...current, timings: [...current.timings, { offset_days: 0, enabled: true }] }));
  }

  function removeTiming(index: number) {
    setSettings((current) => ({ ...current, timings: current.timings.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setErrorMessage('');
    setSuccessMessage('');
    const validation = validateTimings(settings.timings);
    if (!validation.ok) {
      setErrorMessage(validation.error);
      return;
    }
    if (settings.enabled && validation.timings.filter((t) => t.enabled).length === 0) {
      setErrorMessage('車検案内を有効にする場合、少なくとも1つの案内タイミングを有効にしてください。');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch('/api/customer-follow-up/inspection-reminders/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, timings: validation.timings }),
      });
      const data = (await response.json()) as { ok: boolean; settings?: ReminderSettings; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? '保存に失敗しました。');
      if (data.settings) setSettings(data.settings);
      setSuccessMessage('車検案内設定を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunNow() {
    setErrorMessage('');
    setSuccessMessage('');
    setIsRunning(true);
    try {
      const response = await fetch('/api/jobs/inspection-reminders', { method: 'POST' });
      const data = (await response.json()) as { ok: boolean; created?: number; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? '実行に失敗しました。');
      setSuccessMessage(`案内対象の判定を実行しました。新規イベント: ${data.created ?? 0} 件`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '実行に失敗しました。');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <AppShell
      activeLabel="車検案内設定"
      title="車検案内設定"
      description="車検満了日をもとに、案内対象とするタイミングと除外条件を設定します。"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定に戻る
        </Link>
      }
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</section>
      ) : !canManage ? (
        <PermissionDeniedCard />
      ) : (
        <div className="mx-auto max-w-3xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          {successMessage && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-bold text-slate-950">基本設定</h3>
            </div>
            <div className="px-5 py-4">
              <ToggleRow
                label="車検案内を有効にする"
                description="有効にすると、毎日の判定で対象車両の案内イベントを作成します。実際の送信は行いません。"
                checked={settings.enabled}
                onChange={(value) => setSettings((c) => ({ ...c, enabled: value }))}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-bold text-slate-950">案内タイミング</h3>
              <p className="mt-1 text-xs text-slate-500">車検満了の何日前に案内対象とするか。{MIN_OFFSET_DAYS}〜{MAX_OFFSET_DAYS}日、重複不可。</p>
            </div>
            <div className="px-5 py-4">
              {sortedTimings.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">案内タイミングがありません。「タイミングを追加」で登録してください。</p>
              ) : (
                <div className="space-y-2">
                  {settings.timings.map((timing, index) => (
                    <div key={index} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={timing.enabled} onChange={(event) => updateTiming(index, { enabled: event.target.checked })} />
                      <span className="text-sm text-slate-700">車検満了の</span>
                      <input
                        type="number"
                        min={MIN_OFFSET_DAYS}
                        max={MAX_OFFSET_DAYS}
                        value={timing.offset_days || ''}
                        onChange={(event) => updateTiming(index, { offset_days: Number(event.target.value) })}
                        className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                      />
                      <span className="text-sm text-slate-700">日前</span>
                      <button type="button" onClick={() => removeTiming(index)} className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={addTiming} className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                ＋ タイミングを追加
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-bold text-slate-950">対象除外ルール</h3>
            </div>
            <div className="px-5 py-2">
              <ToggleRow label="売約済みの車両を除外する" checked={settings.exclude_sold} onChange={(v) => setSettings((c) => ({ ...c, exclude_sold: v }))} />
              <ToggleRow label="廃車の車両を除外する" checked={settings.exclude_scrapped} onChange={(v) => setSettings((c) => ({ ...c, exclude_scrapped: v }))} />
              <ToggleRow label="車検予約済み・入庫済みの車両を除外する" checked={settings.exclude_reserved_or_in_service} onChange={(v) => setSettings((c) => ({ ...c, exclude_reserved_or_in_service: v }))} />
              <ToggleRow label="顧客に紐づく車両のみ対象にする" checked={settings.require_customer_link} onChange={(v) => setSettings((c) => ({ ...c, require_customer_link: v }))} disabled />
              <p className="px-1 pb-2 text-xs text-slate-400">削除済み車両・車検満了日が未入力の車両は常に対象外です。</p>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={handleRunNow} disabled={isRunning} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
              {isRunning ? '判定中...' : '今すぐ案内対象を判定'}
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300">
              {isSaving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
