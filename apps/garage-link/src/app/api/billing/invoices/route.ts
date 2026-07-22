import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe/client';
import { toBillingInvoice } from '@/lib/stripe/invoiceHistory';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

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
  if (member.role !== 'owner' && member.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '請求書はオーナー・管理者のみ確認できます。' }, { status: 403 });
  }

  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) {
    return NextResponse.json({ ok: true, invoices: [], state: 'not_configured' });
  }

  const { data: activeStore } = await admin
    .from('stores')
    .select('tenant_id')
    .eq('id', member.store_id)
    .single();
  const tenantId = (activeStore as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: '契約会社を特定できません。' }, { status: 500 });
  }

  const { data: subscription, error: subscriptionError } = await admin
    .from('company_subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    return NextResponse.json({ ok: false, error: '契約情報の取得に失敗しました。' }, { status: 500 });
  }

  const customerId = (subscription as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId) return NextResponse.json({ ok: true, invoices: [], state: 'no_customer' });

  try {
    const result = await stripe.invoices.list({ customer: customerId, limit: 24 });
    const invoices = result.data.map(toBillingInvoice).filter((invoice) => invoice !== null);
    return NextResponse.json({ ok: true, invoices, state: 'ready' });
  } catch (error) {
    console.error('[billing/invoices] Stripe invoice list failed', error);
    return NextResponse.json({ ok: false, error: '請求書を取得できませんでした。' }, { status: 502 });
  }
}
