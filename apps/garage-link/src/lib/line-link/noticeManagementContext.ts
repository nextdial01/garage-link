import { createClient } from '@/lib/supabase/server';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';
import { NextResponse } from 'next/server';
export async function noticeManagementContext() {
 const db = await createClient();
 const { data, error } = await db.auth.getUser();
 if (error || !data.user) return { response: NextResponse.json({ ok: false, error: 'ログインを確認してください。' }, { status: 401 }) };
 const { data: member, error: memberError } = await db.from<{ tenant_id: string; store_id: string; role: string }>('current_user_active_store_membership').select('tenant_id,store_id,role').eq('user_id', data.user.id).eq('status', 'active').single();
 if (memberError || !member?.store_id || !member.tenant_id || !['owner', 'admin'].includes(member.role)) return { response: NextResponse.json({ ok: false, error: 'オーナーまたは管理者の権限が必要です。' }, { status: 403 }) };
 if (!await canStoreUseLLink({ tenantId: member.tenant_id, storeId: member.store_id })) return { response: NextResponse.json({ ok: false, error: 'この店舗ではL-LINK連携を利用できません。' }, { status: 403 }) };
 return { db, storeId: member.store_id };
}
