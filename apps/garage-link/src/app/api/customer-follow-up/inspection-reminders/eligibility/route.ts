import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/observability/logServerError';
import type { EligibilitySummary } from '@/lib/inspection-reminders/shared';

export const dynamic = 'force-dynamic';

type StoreMemberRow = { store_id: string; role: string | null };

function canManage(role: string | null) {
  return role === 'owner' || role === 'admin';
}

export async function GET() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json(
      { ok: false, error: 'ログイン情報を取得できませんでした。', code: 'unauthorized' },
      { status: 401 }
    );
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();
  if (memberError || !member?.store_id) {
    return NextResponse.json(
      { ok: false, error: '所属店舗を取得できませんでした。', code: 'forbidden_no_membership' },
      { status: 403 }
    );
  }
  if (!canManage(member.role)) {
    return NextResponse.json(
      { ok: false, error: '権限がありません。', code: 'forbidden_role' },
      { status: 403 }
    );
  }

  try {
    const { data, error } = await supabase.rpc('get_inspection_reminder_eligibility_summary', {
      p_store_id: member.store_id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, summary: data as EligibilitySummary });
  } catch (error) {
    logServerError(
      'inspection_eligibility_read_failed',
      { route: 'inspection-reminders/eligibility', method: 'GET', storeId: member.store_id },
      error
    );
    return NextResponse.json(
      { ok: false, error: '対象診断の取得に失敗しました。', code: 'inspection_eligibility_read_failed' },
      { status: 500 }
    );
  }
}
