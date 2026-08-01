import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type MemberRow = { tenant_id: string; store_id: string; role: string | null };

// スタッフ・店舗・保存容量の追加購入（add-on）は初回販売の対象外。
// 承認済みのStripeテストPrice運用手順が整うまで、ここで一律に拒否する。
export async function POST() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  const { data: member } = await supabase.from<MemberRow>('current_user_active_store_membership').select('tenant_id, store_id, role').eq('user_id', userData.user.id).eq('status', 'active').single();
  if (!member?.store_id || !['owner', 'admin'].includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '契約を変更する権限がありません。' }, { status: 403 });
  }
  return NextResponse.json(
    { ok: false, error: 'スタッフ・店舗・保存容量の追加購入は初回販売の対象外です。' },
    { status: 403 },
  );
}
