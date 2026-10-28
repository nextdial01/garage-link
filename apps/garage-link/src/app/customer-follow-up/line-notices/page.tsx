 'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { NOTICE_LABELS, type NoticeType } from '@/lib/line-link/noticeRules';
type Row = { id: string; kind: string; status: string; created_at: string; imported_at: string | null; revoked_at: string | null };
function draftUrl(id: string) {
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
 try { const base = new URL(process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? 'https://llink.tech'); if (base.protocol !== 'https:') return null; const url = new URL('/broadcasts/garage-link/handoffs', base); url.searchParams.set('request_id', id); return url.href; } catch { return null; }
}
export default function LineNoticesPage() {
 const [rows, setRows] = useState<Row[]>([]), [loading, setLoading] = useState(true), [allowed, setAllowed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
 const attempted = useRef(false);
 async function load() {
  setLoading(true); setAllowed(false); setRows([]); setError('');
  try { const res = await fetch('/api/line-link/handoffs', { cache: 'no-store' }); const body = await res.json(); if (!res.ok || !body.ok || !Array.isArray(body.handoffs)) throw new Error(body.error || '案内一覧を取得できませんでした。'); setRows(body.handoffs); setAllowed(true); } catch (e) { setError(e instanceof Error ? e.message : '案内一覧を取得できませんでした。'); } finally { setLoading(false); }
 }
 useEffect(() => { void load(); }, []);
 async function generate() {
  if (!allowed || attempted.current || busy) return;
  if (!window.confirm('設定済みの車検満了日・月数に該当する買替候補を作成します。LINE送信は行いません。')) return;
  attempted.current = true; setBusy(true); setError(''); setMessage('');
  try { const res = await fetch('/api/line-link/repurchase-generate', { method: 'POST' }); const body = await res.json(); if (!res.ok || !body.ok || !Number.isSafeInteger(body.generated_count) || body.generated_count < 0) throw new Error(); setMessage(`${body.generated_count}件の買替候補を作成しました。L-LINKで内容を確認してください。`); await load(); } catch { setError('生成結果を確認できませんでした。再実行せず、一覧を再読み込みして確認してください。'); } finally { setBusy(false); }
 }
 return <main className="mx-auto max-w-5xl space-y-6 p-6"><h1 className="text-2xl font-bold">L-LINKの案内・配信準備</h1><p>現在の店舗の案内を新しい順に最大100件表示します。取込済みはLINE送信完了を意味しません。送信はL-LINKで内容と対象を確認して行います。</p><div className="flex flex-wrap gap-4"><Link href="/settings/l-link/notices" className="text-blue-700 underline">案内本文・買替時期の設定</Link><button onClick={() => void load()} disabled={loading || busy} className="rounded border px-4 py-2">一覧を再読み込み</button><button onClick={() => void generate()} disabled={!allowed || loading || busy || attempted.current} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">{busy ? '生成中…' : '買替候補を生成'}</button></div>{error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}{loading ? <p>読み込み中…</p> : allowed && rows.length === 0 ? <p>案内はまだありません。商談・見積書・請求書・値下げの配信準備、または買替候補生成から作成できます。</p> : <ul className="space-y-3">{rows.map(row => { const href = draftUrl(row.id); const active = !row.revoked_at && ['pending', 'created', 'imported'].includes(row.status); return <li key={row.id} className="rounded border p-4"><p className="font-bold">{NOTICE_LABELS[row.kind as NoticeType] ?? '案内'}</p><p>{new Date(row.created_at).toLocaleString('ja-JP')} · {row.revoked_at || row.status === 'invalidated' ? '無効' : row.status === 'imported' ? 'L-LINK取込済み（送信状況はL-LINKで確認）' : '配信準備待ち'}</p><p className="break-all text-xs">案内ID: {row.id}</p>{active && href && <a href={href} className="text-blue-700 underline">L-LINKで開く</a>}</li>; })}</ul>}</main>;
}
