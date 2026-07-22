import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/observability/logServerError';
import {
  CANDIDATE_EVENT_TYPES,
  type CandidateEventType,
  type DeliveryCandidate,
  type DeliveryDraftBatch,
} from '@/lib/line-link/deliveryCandidates';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';

// GARAGE LINK → L-LINK 配信候補の受け渡し（読み取り専用契約）。
// - 認証ユーザーのセッション（RLS: 所属店舗のみ）でアクセス。service_role 非依存。
// - status='pending' の配信候補のみを返す。実LINE送信・Stripe・外部送信は一切行わない。
// - PII最小化: LINE友だちID等は返さず customer_id で L-LINK 側に解決させる。
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;
type StoreMemberRow = { store_id: string; role: string | null };
type EventRow = {
  id: string;
  company_id: string | null;
  store_id: string;
  customer_id: string | null;
  event_type: CandidateEventType;
  reminder_offset_days: number;
  inspection_expiry_date: string;
  customer_name: string | null;
  vehicle_name: string | null;
  created_at: string;
};

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
  if (!(await canStoreUseLLink(member.store_id))) {
    return NextResponse.json({ ok: false, error: 'L-LINK連携はStandard以上の契約が必要です。', code: 'plan_required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? '';
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit') ?? '50') || 50));

  try {
    // RLS に加え member.store_id で明示スコープ（他店舗・他社を跨がない）。pendingのみ。
    let query = supabase
      .from<EventRow>('inspection_reminder_events')
      .select('id, company_id, store_id, customer_id, event_type, reminder_offset_days, inspection_expiry_date, customer_name, vehicle_name, created_at')
      .eq('store_id', member.store_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (type && (CANDIDATE_EVENT_TYPES as readonly string[]).includes(type)) {
      query = query.eq('event_type', type);
    }

    const { data, error } = await query.range(0, limit - 1);
    if (error) throw new Error(error.message);

    const candidates: DeliveryCandidate[] = (data ?? []).map((e) => ({
      event_id: e.id,
      company_id: e.company_id,
      store_id: e.store_id,
      customer_id: e.customer_id,
      event_type: e.event_type,
      reminder_offset_days: e.reminder_offset_days,
      reference_date: e.inspection_expiry_date,
      customer_name: e.customer_name,
      vehicle_name: e.vehicle_name,
      created_at: e.created_at,
    }));

    const batch: DeliveryDraftBatch = { store_id: member.store_id, total: candidates.length, candidates };
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    logServerError('line_link_candidates_read_failed', { route: 'line-link/delivery-candidates', method: 'GET', storeId: member.store_id }, error);
    return NextResponse.json({ ok: false, error: '配信候補の取得に失敗しました。', code: 'line_link_candidates_read_failed' }, { status: 500 });
  }
}
