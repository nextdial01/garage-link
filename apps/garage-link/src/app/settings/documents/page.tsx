'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import RoleAccessGate from '@/components/RoleAccessGate';
import { canManageSettings } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/client';
import { requireActiveGarageStore, subscribeGarageStoreSwitch } from '@/lib/store/garageUiContext';
import { toUserErrorMessage } from '@/lib/errors/user-error';
import { DOCUMENT_NUMBER_RULE } from '@/lib/business/documentNumbers';
import type { TaxDisplayMode } from '@/lib/business/money';

type Settings = { tax_display_mode: TaxDisplayMode; quote_note: string; invoice_note: string };
type Store = Settings & { name: string | null; company_name: string | null; address: string | null };
const initial: Settings = { tax_display_mode: 'included', quote_note: '', invoice_note: '' };
const input = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 disabled:bg-slate-100';
const panel = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';
const link = 'font-bold text-blue-700 underline underline-offset-4';

export default function DocumentSettingsPage() {
  const generation = useRef(0);
  const [form, setForm] = useState<Settings>(initial);
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError(''); setMessage(''); setStoreId(''); setRole('');
    setForm(initial); setCompany(''); setQuoteId(''); setInvoiceId('');
    try {
      const context = await requireActiveGarageStore({ force: true });
      const client = createClient();
      const [store, quotes, invoices] = await Promise.all([
        client.from<Store>('stores').select('name, company_name, address, tax_display_mode, quote_note, invoice_note').eq('id', context.storeId).single(),
        client.from<{ id: string }>('quotes').select('id').eq('store_id', context.storeId).order('created_at', { ascending: false }).limit(1),
        client.from<{ id: string }>('invoices').select('id').eq('store_id', context.storeId).order('created_at', { ascending: false }).limit(1),
      ]);
      if (store.error || !store.data) throw new Error(store.error?.message ?? '帳票設定を取得できませんでした。');
      if (quotes.error || invoices.error) throw new Error(quotes.error?.message ?? invoices.error?.message);
      if (request !== generation.current) return;
      setStoreId(context.storeId); setRole(context.role);
      setForm({ tax_display_mode: store.data.tax_display_mode === 'excluded' ? 'excluded' : 'included', quote_note: store.data.quote_note ?? '', invoice_note: store.data.invoice_note ?? '' });
      setCompany([store.data.company_name || store.data.name, store.data.address].filter(Boolean).join(' / '));
      setQuoteId(quotes.data?.[0]?.id ?? ''); setInvoiceId(invoices.data?.[0]?.id ?? '');
    } catch (failure) { if (request === generation.current) setError(toUserErrorMessage(failure, '帳票設定を取得できませんでした。')); }
    finally { if (request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    const unsubscribe = subscribeGarageStoreSwitch(() => { void load(); });
    return () => { active = false; generation.current += 1; unsubscribe(); };
  }, [load]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || loading || !storeId || !canManageSettings(role)) return;
    const request = generation.current;
    setSaving(true); setError(''); setMessage('');
    try {
      const context = await requireActiveGarageStore({ force: true });
      if (request !== generation.current || context.storeId !== storeId || !canManageSettings(context.role)) throw new Error('店舗または権限が変わりました。画面を再読み込みしてください。');
      const { error: saveError } = await createClient().from('stores').update(form).eq('id', storeId).select('id').single();
      if (saveError) throw new Error(saveError.message);
      if (request === generation.current) setMessage('帳票設定を保存しました。');
    } catch (failure) { if (request === generation.current) setError(toUserErrorMessage(failure, '帳票設定を保存できませんでした。')); }
    finally { setSaving(false); }
  }
  const disabled = loading || saving || !storeId || !canManageSettings(role);
  return <AppShell activeLabel="帳票設定" title="帳票設定" description="金額表示方式、共通備考、会社情報と帳票の確認をまとめて管理します。" actionButton={<Link href="/settings" className={link}>設定へ戻る</Link>}>
    <RoleAccessGate allowedRoles={['owner', 'admin', 'implementer']} backHref="/settings">
      <div className="mx-auto max-w-4xl space-y-6">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
        {loading && <p role="status">帳票設定を読み込んでいます。</p>}
        <form onSubmit={save} className={panel}>
          <h2 className="text-lg font-bold">表示方式と共通備考</h2>
          <label className="mt-5 block font-semibold">金額表示方式<select aria-label="金額表示方式" className={input} value={form.tax_display_mode} disabled={disabled} onChange={(event) => setForm({ ...form, tax_display_mode: event.target.value as TaxDisplayMode })}><option value="included">税込表示</option><option value="excluded">税抜表示</option></select></label>
          <p className="mt-2 text-sm text-slate-600">新しく作成する帳票と金額入力へ適用します。保存済み帳票は保存時の表示方式と金額を維持します。非課税・税対象外の費用は区別して表示します。</p>
          <label className="mt-5 block font-semibold">見積書の既定備考<textarea aria-label="見積書の既定備考" className={input} rows={4} value={form.quote_note} disabled={disabled} onChange={(event) => setForm({ ...form, quote_note: event.target.value })} /></label>
          <label className="mt-5 block font-semibold">請求書の既定備考<textarea aria-label="請求書の既定備考" className={input} rows={4} value={form.invoice_note} disabled={disabled} onChange={(event) => setForm({ ...form, invoice_note: event.target.value })} /></label>
          <p className="mt-2 text-sm text-slate-600">会社情報の「見積書備考」「請求書備考」と同じ設定です。帳票プレビューの共通備考へ表示され、各帳票に入力した個別備考は追加表示されます。共通備考の変更は過去の帳票を再表示した場合にも反映されます。</p>
          <button type="submit" disabled={disabled} className="mt-5 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? '保存中…' : '帳票設定を保存'}</button>
          {!loading && !canManageSettings(role) && <p className="mt-3 text-sm text-slate-600">変更はオーナー・管理者が行えます。</p>}
        </form>
        <section className={panel}>
          <h2 className="text-lg font-bold">帳票番号の表示規則</h2>
          <dl className="mt-4 space-y-3 text-sm"><div><dt className="font-bold">Webの見積新規作成</dt><dd>Q-{DOCUMENT_NUMBER_RULE}</dd></div><div><dt className="font-bold">Webの請求新規作成</dt><dd>INV-{DOCUMENT_NUMBER_RULE}</dd></div></dl>
          <p className="mt-3 text-sm text-slate-600">作成画面で自動入力され、保存前に編集できます。モバイルや既存の帳票は異なる形式の場合があります。保存済み番号は変更されません。</p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-bold">会社情報と帳票の確認</h2>
          <p className="mt-3 text-sm text-slate-700">{company}</p>
          <p className="mt-2 text-sm text-slate-600">会社名・住所・登録番号・振込先・ロゴ・印影・帳票色・フッターは会社情報で編集します。</p>
          <div className="mt-4 flex flex-wrap gap-5"><Link href="/settings/company" className={link}>会社情報を編集</Link><Link href="/quotes" className={link}>見積一覧から確認</Link><Link href="/invoices" className={link}>請求一覧から確認</Link></div>
          <div className="mt-4 flex flex-wrap gap-5">{quoteId && <Link href={`/quotes/${quoteId}/preview`} className={link}>最新の見積をプレビュー</Link>}{invoiceId && <Link href={`/invoices/${invoiceId}/preview`} className={link}>最新の請求をプレビュー</Link>}</div>
          {!loading && !quoteId && !invoiceId && <p className="mt-3 text-sm text-slate-600">帳票を保存すると、ここから最新のプレビューを確認できます。</p>}
        </section>
      </div>
    </RoleAccessGate>
  </AppShell>;
}
