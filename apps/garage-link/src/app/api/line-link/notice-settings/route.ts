import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';
import type { GarageTenantContext } from '@/lib/security/garageTenantContext';
import { defaultNoticeSettings, validateNoticeSettings, type NoticeSettings } from '@/lib/line-link/noticeRules';
export const dynamic = 'force-dynamic';
const columns = 'repurchase_enabled, repurchase_before_months, templates, updated_at';
function fail(error: string, status: number) { return NextResponse.json({ ok: false, error }, { status }); }
async function context() {
 const db = await createClient();
 const { data: auth, error: authError } = await db.auth.getUser();
 if (authError || !auth.user) return { response: fail('ログイン情報を確認してください。', 401) };
 const { data: member, error } = await db.from<{tenant_id: string; store_id: string; role: string}>('current_user_active_store_membership').select('tenant_id, store_id, role').eq('user_id', auth.user.id).eq('status', 'active').single();
 if (error || !member?.tenant_id || !member.store_id || !['owner', 'admin'].includes(member.role)) return { response: fail('オーナーまたは管理者の権限が必要です。', 403) };
 const tenant: GarageTenantContext = { tenantId: member.tenant_id, storeId: member.store_id, actorUserId: auth.user.id, actorRole: member.role as 'owner' | 'admin', source: 'api', correlationId: crypto.randomUUID() };
 if (!await canStoreUseLLink(tenant)) return { response: fail('この店舗ではL-LINK連携を利用できません。', 403) };
 return { db, storeId: member.store_id };
}
export async function GET() {
 try {
  const ctx = await context(); if (ctx.response) return ctx.response;
  const { data, error } = await ctx.db!.from<NoticeSettings>('garage_link_notice_settings').select(columns).eq('store_id', ctx.storeId!).maybeSingle();
  if (error) return fail('案内設定を取得できませんでした。', 500);
  if (data && !validateNoticeSettings(data)) return fail('保存済みの案内設定を確認できませんでした。', 500);
  return NextResponse.json({ ok: true, settings: data ?? defaultNoticeSettings() });
 } catch { return fail('案内設定を取得できませんでした。', 500); }
}
export async function PUT(request: Request) {
 try {
  const ctx = await context(); if (ctx.response) return ctx.response;
  // Bounded request parsing; never accept caller-supplied store/role or overwrite without CAS.
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim() !== 'application/json') return fail('JSON形式で送信してください。', 415);
  const reader = request.body?.getReader(); if (!reader) return fail('設定が不正です。', 400);
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const item = await reader.read(); if (item.done) break; length += item.value.length; if (length > 100000) { await reader.cancel(); return fail('設定が大きすぎます。', 413); } chunks.push(item.value); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let input: unknown; try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return fail('設定が不正です。', 400); }
  if (!validateNoticeSettings(input)) return fail('月数・本文・差し込み項目を確認してください。', 400);
  const { updated_at, ...values } = input;
  const query = updated_at === null
   ? ctx.db!.from<NoticeSettings>('garage_link_notice_settings').insert({ ...values, store_id: ctx.storeId! })
   : ctx.db!.from<NoticeSettings>('garage_link_notice_settings').update(values).eq('store_id', ctx.storeId!).eq('updated_at', updated_at);
  const { data, error } = await query.select(columns).maybeSingle();
  if (error?.code === '23505' || (!error && !data)) return fail('別の更新がありました。再読み込みして設定を確認してください。', 409);
  if (error || !data || !validateNoticeSettings(data)) return fail('案内設定を保存できませんでした。', 500);
  return NextResponse.json({ ok: true, settings: data });
 } catch { return fail('案内設定を保存できませんでした。', 500); }
}
