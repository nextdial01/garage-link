import { NextResponse } from 'next/server';
import { getAppBaseUrl } from '@/lib/stripe/garageBilling';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  tenant_id: string;
  store_id: string;
  role: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('current_user_active_store_membership')
    .select('tenant_id, store_id, role')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .single();

  if (memberError || !member?.tenant_id || !member.store_id) {
    return NextResponse.json({ ok: false, error: '有効な所属店舗が見つかりません。' }, { status: 403 });
  }
  if (member.role !== 'owner' && member.role !== 'admin') {
    return NextResponse.json({ ok: false, error: '契約管理はオーナー・管理者のみ利用できます。' }, { status: 403 });
  }

  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) {
    return NextResponse.json({ ok: false, error: '契約管理機能が設定されていません。' }, { status: 503 });
  }

  const { data: subscription, error: subscriptionError } = await admin
    .from('company_subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', member.tenant_id)
    .in('status', ['active', 'past_due', 'trialing', 'cancelled'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    return NextResponse.json({ ok: false, error: '契約情報の取得に失敗しました。' }, { status: 500 });
  }

  const customerId = (subscription as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: 'Stripeのお客様情報がまだありません。先に有料プランをお申し込みください。' },
      { status: 409 },
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getAppBaseUrl(request.url)}/settings/billing`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch {
    return NextResponse.json({ ok: false, error: '契約管理ページを開けませんでした。' }, { status: 502 });
  }
}
