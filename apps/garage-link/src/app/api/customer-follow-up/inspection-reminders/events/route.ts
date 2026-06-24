import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/observability/logServerError';
import { REMINDER_STATUSES } from '@/lib/inspection-reminders/shared';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
type StoreMemberRow = { store_id: string; role: string | null };

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。', code: 'unauthorized' }, { status: 401 });
  }
  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();
  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。', code: 'forbidden_no_membership' }, { status: 403 });
  }
  const service = serviceSupabase();
  if (!service) {
    return NextResponse.json({ ok: false, error: 'サーバー設定が未設定です。', code: 'config_missing' }, { status: 500 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? '';
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const keyword = (url.searchParams.get('keyword') ?? '').replace(/[,%]/g, ' ').trim();
  const page = Math.max(0, Number(url.searchParams.get('page') ?? '0') || 0);

  try {
    // RLS非依存に service role で取得するが、必ず member.store_id にスコープする（他社データを跨がない）。
    let query = service
      .from('inspection_reminder_events')
      .select(
        'id, store_id, customer_id, vehicle_id, inspection_expiry_date, reminder_offset_days, status, customer_name, vehicle_name, maker, model_name, registration_no, assigned_user_name, external_reference_id, error_detail, created_at, stores(name)',
        { count: 'exact' }
      )
      .eq('store_id', member.store_id)
      .order('created_at', { ascending: false });

    if (status && (REMINDER_STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    }
    if (from) query = query.gte('created_at', `${from}T00:00:00`);
    if (to) query = query.lte('created_at', `${to}T23:59:59`);
    if (keyword) query = query.or(`customer_name.ilike.%${keyword}%,vehicle_name.ilike.%${keyword}%`);

    const fromRow = page * PAGE_SIZE;
    const { data, count, error } = await query.range(fromRow, fromRow + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, pageSize: PAGE_SIZE });
  } catch (error) {
    logServerError('inspection_events_read_failed', { route: 'inspection-reminders/events', method: 'GET', storeId: member.store_id }, error);
    return NextResponse.json({ ok: false, error: '履歴の取得に失敗しました。', code: 'inspection_events_read_failed' }, { status: 500 });
  }
}
