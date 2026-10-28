'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { DEFAULT_TEMPLATES, NOTICE_MERGE_FIELDS, NOTICE_LABELS, NOTICE_TYPES, validateNoticeSettings, type NoticeSettings } from '@/lib/line-link/noticeRules';
export default function NoticeSettingsPage() {
 const [settings, setSettings] = useState<NoticeSettings | null>(null);
 const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false);
 const pending = useRef(false);
 async function load() {
  if (pending.current) return; pending.current = true; setBusy(true); setError(''); setSuccess(''); setSettings(null);
  try { const response = await fetch('/api/line-link/notice-settings', { cache: 'no-store' }); const body = await response.json();
   if (!response.ok || !body.ok || !validateNoticeSettings(body.settings)) throw new Error(body.error || '案内設定を取得できませんでした。'); setSettings(body.settings);
  } catch (e) { setError(e instanceof Error ? e.message : '案内設定を取得できませんでした。'); } finally { pending.current = false; setBusy(false); }
 }
 useEffect(() => { void load(); }, []);
 async function save() {
  if (pending.current || !settings) return; setError(''); setSuccess('');
  if (!validateNoticeSettings(settings)) { setError('月数・本文・差し込み項目を確認してください。'); return; }
  pending.current = true; setBusy(true);
  try { const response = await fetch('/api/line-link/notice-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); const body = await response.json();
   if (!response.ok || !body.ok || !validateNoticeSettings(body.settings)) throw new Error(body.error || '案内設定を保存できませんでした。'); setSettings(body.settings); setSuccess('案内設定を保存しました。');
  } catch (e) { setError(e instanceof Error ? e.message : '案内設定を保存できませんでした。'); } finally { pending.current = false; setBusy(false); }
 }
 return <AppShell activeLabel="設定" title="L-LINK案内設定" description="配信候補の条件と本文を設定します。送信前にL-LINKで下書きを確認してください。">
  <div className="mx-auto max-w-3xl space-y-5">
   <Link href="/settings/l-link" className="text-blue-700 underline">L-LINK連携へ戻る</Link>
   {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
   {success && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-700">{success}</p>}
   <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border px-4 py-2">再読み込み</button>
   {settings && <fieldset disabled={busy} className="space-y-5 rounded-2xl border bg-white p-6">
    <legend className="font-bold">買替提案の条件</legend>
    <label className="flex gap-2"><input type="checkbox" checked={settings.repurchase_enabled} onChange={e => setSettings({ ...settings, repurchase_enabled: e.target.checked })} />買替提案の候補を作成する</label>
    <label className="block">車検満了日の何か月前から案内するか<input aria-label="車検満了前の月数" type="number" min={0} max={60} step={1} value={Number.isFinite(settings.repurchase_before_months) ? settings.repurchase_before_months : ''} onChange={e => setSettings({ ...settings, repurchase_before_months: e.target.value === '' ? NaN : Number(e.target.value) })} className="ml-3 w-24 rounded border p-2" /></label>
    <p className="text-sm text-slate-600">暦月で計算し、対象月に同じ日がない場合は月末とします。納車日からの年数ではありません。</p>
    {NOTICE_TYPES.map(type => <label key={type} className="block space-y-2 font-bold">{NOTICE_LABELS[type]}の本文<span className="block text-sm font-normal text-slate-600">使える差し込み項目：{NOTICE_MERGE_FIELDS[type].map(field => '{{' + field + '}}').join('、')}</span><textarea aria-label={NOTICE_LABELS[type] + 'の本文'} value={settings.templates[type]} maxLength={4000} rows={4} placeholder={DEFAULT_TEMPLATES[type]} onChange={e => setSettings({ ...settings, templates: { ...settings.templates, [type]: e.target.value } })} className="block w-full rounded-lg border p-3 font-normal" /></label>)}
    <button type="button" onClick={() => void save()} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">{busy ? '保存中…' : '設定を保存'}</button>
   </fieldset>}
  </div>
 </AppShell>;
}
