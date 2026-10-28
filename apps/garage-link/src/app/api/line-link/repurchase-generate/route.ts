import { NextResponse } from 'next/server';
import { noticeManagementContext } from '@/lib/line-link/noticeManagementContext';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
 try {
  const ctx = await noticeManagementContext(); if (ctx.response) return ctx.response;
  // No caller-supplied store, dates, customer IDs or recipient overrides.
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ ok: false }, { status: 403 });
  if (request.body) { const reader = request.body.getReader(); const first = await reader.read(); await reader.cancel(); if (!first.done) return NextResponse.json({ ok: false }, { status: 400 }); }
  const { data, error } = await ctx.db!.rpc('garage_link_generate_repurchase', { p_store_id: ctx.storeId! });
  if (error || typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) throw new Error();
  return NextResponse.json({ ok: true, generated_count: data });
 } catch { return NextResponse.json({ ok: false, error: '生成結果を確認できませんでした。一覧を確認し、結果不明のまま再実行しないでください。' }, { status: 409 }); }
}
