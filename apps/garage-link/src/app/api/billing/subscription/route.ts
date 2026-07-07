import { NextResponse } from 'next/server';
import { createDefaultFreeSubscription } from '@/lib/billing/garageSubscription';
import { translateDbError } from '@/lib/errors/translate-db-error';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

const subscriptionColumns =
  'id, company_id, plan, status, included_staff_count, extra_staff_count, included_store_count, extra_store_count, storage_limit_mb, extra_storage_gb, current_inventory_limit, l_link_integration_enabled, started_at, updated_at, stripe_customer_id, stripe_subscription_id, cancelled_at, data_delete_scheduled_at, data_deleted_at';

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗が見つかりません。' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: true, subscription: createDefaultFreeSubscription(member.store_id), source: 'fallback' },
      { status: 200 },
    );
  }

  const { data: existing, error: readError } = await admin
    .from('company_subscriptions')
    .select(subscriptionColumns)
    .eq('company_id', member.store_id)
    .eq('status', 'active')
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: translateDbError(readError.message) }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ ok: true, subscription: existing, source: 'database' });
  }

  const { data: cancelled, error: cancelledError } = await admin
    .from('company_subscriptions')
    .select(subscriptionColumns)
    .eq('company_id', member.store_id)
    .eq('status', 'cancelled')
    .is('data_deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cancelledError) {
    return NextResponse.json({ ok: false, error: translateDbError(cancelledError.message) }, { status: 500 });
  }

  if (cancelled) {
    return NextResponse.json({ ok: true, subscription: cancelled, source: 'cancelled_retention' });
  }

  const fallback = createDefaultFreeSubscription(member.store_id);
  const { data: inserted, error: insertError } = await admin
    .from('company_subscriptions')
    .insert({
      company_id: fallback.company_id,
      plan: fallback.plan,
      status: fallback.status,
      included_staff_count: fallback.included_staff_count,
      extra_staff_count: fallback.extra_staff_count,
      included_store_count: fallback.included_store_count,
      extra_store_count: fallback.extra_store_count,
      storage_limit_mb: fallback.storage_limit_mb,
      extra_storage_gb: fallback.extra_storage_gb,
      current_inventory_limit: fallback.current_inventory_limit,
      l_link_integration_enabled: fallback.l_link_integration_enabled,
    })
    .select(subscriptionColumns)
    .single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: translateDbError(insertError.message) }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subscription: inserted, source: 'created' });
}
