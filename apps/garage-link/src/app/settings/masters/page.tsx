'use client';

import { useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';
import { toUserErrorMessage } from '@/lib/errors/user-error';
import { MASTER_KINDS, type MasterEntry, type MasterKind } from '@/lib/business/masters';
import { useBusinessSettings } from '@/lib/business/useBusinessSettings';
import type { TaxDisplayMode } from '@/lib/business/money';

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950';

export default function MastersPage() {
  const settings = useBusinessSettings();
  const [kind, setKind] = useState<MasterKind>('vehicle_maker');
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [order, setOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const allowed = ['owner', 'admin'].includes(settings.role);

  function reset() { setEditing(null); setLabel(''); setOrder('0'); setActive(true); }
  function edit(entry: MasterEntry) { setEditing(entry.id); setLabel(entry.label); setOrder(String(entry.sort_order)); setActive(entry.is_active); setMessage(''); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!allowed || !settings.storeId || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (!label.trim() || !Number.isSafeInteger(Number(order))) throw new Error('名称と整数の表示順を入力してください。');
      const client = createClient();
      const values = { label: label.trim(), sort_order: Number(order), is_active: active };
      const result = editing
        ? await client.from('store_master_entries').update(values).eq('id', editing).eq('store_id', settings.storeId).select('id').single()
        : await client.from('store_master_entries').insert({ ...values, store_id: settings.storeId, kind }).select('id').single();
      if (result.error) throw new Error(result.error.message);
      reset(); await settings.reload(); setMessage('保存しました。');
    } catch (failure) { setError(toUserErrorMessage(failure, '保存できませんでした。')); }
    finally { setBusy(false); }
  }
  async function saveMode(mode: TaxDisplayMode) {
    if (!allowed || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error } = await createClient().from('stores').update({ tax_display_mode: mode }).eq('id', settings.storeId).select('id').single();
      if (error) throw new Error(error.message);
      await settings.reload(); setMessage('金額表示方式を保存しました。保存済み帳票の金額は維持されます。');
    } catch (failure) { setError(toUserErrorMessage(failure, '設定を保存できませんでした。')); }
    finally { setBusy(false); }
  }

  return <AppShell activeLabel="設定" title="マスター管理" description="この店舗の選択肢と金額表示方式を管理します。">
    <div className="mx-auto max-w-4xl space-y-6">
      {(error || settings.error) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error || settings.error}</p>}
      {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="mb-3 text-lg font-bold">金額表示方式</h2>
        <label className="block">新しく作成する帳票・金額入力の表示方式
          <select aria-label="金額表示方式" className={`${input} mt-2`} value={settings.mode} disabled={!allowed || busy || settings.loading} onChange={(event) => void saveMode(event.target.value as TaxDisplayMode)}>
            <option value="included">税込表示</option><option value="excluded">税抜表示</option>
          </select>
        </label>
        <p className="mt-2 text-sm text-slate-600">過去の帳票は保存時の方式と金額で表示します。法定費用などの税対象外項目には税を加えません。</p>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <label className="font-bold">マスターの種類<select className={`${input} mt-2`} value={kind} onChange={(event) => { setKind(event.target.value as MasterKind); reset(); }}>
          {Object.entries(MASTER_KINDS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        {allowed && <form onSubmit={save} className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
          <label>名称<input className={input} value={label} maxLength={200} required onChange={(event) => setLabel(event.target.value)} /></label>
          <label>表示順<input className={input} type="number" step="1" value={order} required onChange={(event) => setOrder(event.target.value)} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />有効</label>
          <div className="flex gap-3 sm:col-span-3"><button disabled={busy || settings.loading} className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white">{editing ? '変更を保存' : '追加'}</button>{editing && <button type="button" onClick={reset}>キャンセル</button>}</div>
        </form>}
        {!settings.loading && !allowed && <p className="mt-4 text-sm text-slate-600">変更はオーナー・管理者が行えます。</p>}
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm"><thead><tr><th className="p-2">表示順</th><th className="p-2">名称</th><th className="p-2">状態</th><th className="p-2">操作</th></tr></thead><tbody>
          {settings.entries.filter((entry) => entry.kind === kind).map((entry) => <tr key={entry.id} className="border-t"><td className="p-2">{entry.sort_order}</td><td className="p-2">{entry.label}</td><td className="p-2">{entry.is_active ? '有効' : '無効'}</td><td className="p-2">{allowed && <button className="font-bold text-blue-700" onClick={() => edit(entry)}>編集</button>}</td></tr>)}
        </tbody></table></div>
        {!settings.loading && !settings.entries.some((entry) => entry.kind === kind) && <p className="mt-4 text-slate-500">まだ登録されていません。</p>}
        <p className="mt-4 text-sm text-slate-600">使わなくなった選択肢は編集から無効にしてください。既存データの名称は残ります。表示順は小さい数から並びます。</p>
      </section>
    </div>
  </AppShell>;
}
