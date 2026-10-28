import { NextResponse } from 'next/server';
import { noticeManagementContext } from '@/lib/line-link/noticeManagementContext';
export async function GET() {
 try {
  const ctx = await noticeManagementContext(); if (ctx.response) return ctx.response;
  const { data, error } = await ctx.db!.from('garage_link_handoffs').select('id,kind,status,created_at,imported_at,revoked_at').eq('store_id', ctx.storeId!).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error();
  return NextResponse.json({ ok: true, handoffs: data ?? [], limit: 100 }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return NextResponse.json({ ok: false, error: '案内一覧を取得できませんでした。' }, { status: 500 }); }
}
