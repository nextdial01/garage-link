'use client';
import { useRef, useState } from 'react';
import { NOTICE_LABELS, type NoticeType } from '@/lib/line-link/noticeRules';
export default function GarageLinkNoticeButton({ kind, sourceId, disabled = false }: { kind: NoticeType; sourceId: string; disabled?: boolean }) {
 const attempted = useRef(false), key = useRef<string | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [links, setLinks] = useState<string[]>([]);
 async function prepare() {
  if (attempted.current || disabled || !sourceId) return;
  if (!window.confirm(kind === 'price_reduction' ? '保存済みの直近の値下げを、進行中商談の顧客への配信候補として作成します。LINE送信は行いません。' : 'この内容をL-LINKの配信準備へ渡します。LINE送信は行いません。')) return;
  attempted.current = true; key.current ??= crypto.randomUUID(); setBusy(true); setError('');
  try {
   const response = await fetch('/api/line-link/handoffs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, source_id: sourceId, idempotency_key: key.current }) });
   const body = await response.json();
   if (!response.ok || !body.ok || !Array.isArray(body.request_ids) || !body.request_ids.length || !body.request_ids.every((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) throw new Error();
   const base = new URL(process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? 'https://llink.tech');
   if (base.protocol !== 'https:') throw new Error();
   const urls = body.request_ids.map((id: string) => { const url = new URL('/broadcasts/garage-link/handoffs', base); url.searchParams.set('request_id', id); return url.href; });
   setLinks(urls); if (urls.length === 1) window.location.assign(urls[0]);
  } catch { setError('作成結果を確認できませんでした。重複作成を避けるため再送せず、案内の状態を確認してください。'); } finally { setBusy(false); }
 }
 return <div className="space-y-2"><button type="button" disabled={disabled || busy || attempted.current || !sourceId} onClick={() => void prepare()} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? '準備中…' : kind === 'price_reduction' ? '値下げ案内をL-LINKで配信準備' : `${NOTICE_LABELS[kind]}をL-LINKで配信準備`}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{links.map((href, i) => <a key={href} href={href} className="block text-blue-700 underline">配信準備 {i + 1} を開く</a>)}</div>;
}
