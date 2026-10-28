import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';
import { createHandoffs, parseHandoffInput, readHandoffBody } from '@/lib/line-link/handoffs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
 try {
  const db = await createClient(); const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ ok: false, error: 'ログインを確認してください。' }, { status: 401 });
  const { data: member, error } = await db.from<{ tenant_id: string; store_id: string; role: string }>('current_user_active_store_membership').select('tenant_id,store_id,role').eq('user_id', auth.user.id).eq('status', 'active').single();
  if (error || !member || !['owner', 'admin'].includes(member.role)) return NextResponse.json({ ok: false, error: 'オーナーまたは管理者の権限が必要です。' }, { status: 403 });
  if (!await canStoreUseLLink({ tenantId: member.tenant_id, storeId: member.store_id })) return NextResponse.json({ ok: false, error: 'L-LINK連携を利用できません。' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ ok: false }, { status: 415 });
  const body = await readHandoffBody(request, 16000); if (body.length > 16000) return NextResponse.json({ ok: false }, { status: 413 });
  let input; try { input = parseHandoffInput(JSON.parse(body)); } catch { input = null; }
  if (!input) return NextResponse.json({ ok: false, error: '案内対象を確認してください。' }, { status: 400 });
  const ids = await createHandoffs(db, member.store_id, input);
  return NextResponse.json({ ok: true, request_ids: ids });
 } catch { return NextResponse.json({ ok: false, error: '案内を作成できませんでした。権限・対象・発行状態・価格履歴を確認し、結果不明の場合は再送せず確認してください。' }, { status: 409 }); }
}

export { GET } from './list';
