import { NextResponse } from 'next/server';
import { canAddStaff, canAddStorage, canAddStore } from '@/lib/billing/garagePlans';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type OptionType = 'add_staff' | 'add_store' | 'add_storage';
type MemberRow = { store_id: string; role: string | null };
type SubscriptionRow = {
  id: string;
  company_id: string;
  tenant_id: string;
  plan: string;
  stripe_subscription_id: string | null;
  extra_staff_count: number;
  extra_store_count: number;
  extra_storage_gb: number;
};

const optionPriceEnv: Record<OptionType, string> = {
  add_staff: 'STRIPE_PRICE_EXTRA_STAFF',
  add_store: 'STRIPE_PRICE_EXTRA_STORE',
  add_storage: 'STRIPE_PRICE_EXTRA_STORAGE_10GB',
};

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const admin = createAdminClient();
  if (!stripe || !admin) {
    return NextResponse.json({ ok: false, error: '追加オプションの決済設定が未完了です。' }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  const { data: member } = await supabase.from<MemberRow>('store_members').select('store_id, role').eq('user_id', userData.user.id).single();
  if (!member?.store_id || !['owner', 'admin'].includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '契約を変更する権限がありません。' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { type?: OptionType; amount?: number; termsAccepted?: boolean } | null;
  if (body?.termsAccepted !== true) {
    return NextResponse.json({ ok: false, error: '契約変更には利用規約への同意が必要です。', code: 'terms_not_accepted' }, { status: 400 });
  }
  const type = body?.type;
  const amount = Number(body?.amount);
  if (!type || !Object.hasOwn(optionPriceEnv, type) || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: '追加内容が不正です。' }, { status: 400 });
  }
  if (type === 'add_storage' && amount % 10 !== 0) {
    return NextResponse.json({ ok: false, error: 'ストレージは10GB単位で追加してください。' }, { status: 400 });
  }

  const { data: store } = await admin.from('stores').select('tenant_id').eq('id', member.store_id).single();
  const tenantId = (store as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId) return NextResponse.json({ ok: false, error: '契約会社を特定できません。' }, { status: 400 });
  const { data } = await admin
    .from('company_subscriptions')
    .select('id, company_id, tenant_id, plan, stripe_subscription_id, extra_staff_count, extra_store_count, extra_storage_gb')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();
  const subscription = data as SubscriptionRow | null;
  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ ok: false, error: '有料契約が見つかりません。' }, { status: 409 });
  }
  if (
    (type === 'add_staff' && !canAddStaff(subscription.plan)) ||
    (type === 'add_store' && !canAddStore(subscription.plan)) ||
    (type === 'add_storage' && !canAddStorage(subscription.plan))
  ) {
    return NextResponse.json({ ok: false, error: '現在のプランではこのオプションを追加できません。' }, { status: 400 });
  }

  const priceId = process.env[optionPriceEnv[type]]?.trim();
  if (!priceId) {
    return NextResponse.json({ ok: false, error: '追加オプションのStripe Price IDが未設定です。' }, { status: 503 });
  }

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    const existingItem = stripeSubscription.items.data.find((item) => item.price.id === priceId);
    const currentQuantity = type === 'add_staff'
      ? subscription.extra_staff_count
      : type === 'add_store'
        ? subscription.extra_store_count
        : subscription.extra_storage_gb / 10;
    const addQuantity = type === 'add_storage' ? amount / 10 : amount;
    const nextQuantity = currentQuantity + addQuantity;

    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: existingItem
        ? [{ id: existingItem.id, quantity: nextQuantity }]
        : [{ price: priceId, quantity: nextQuantity }],
      proration_behavior: 'none',
      metadata: {
        ...stripeSubscription.metadata,
        terms_accepted_at: new Date().toISOString(),
        terms_version: '2026-07-23',
      },
    });

    const patch = type === 'add_staff'
      ? { extra_staff_count: subscription.extra_staff_count + amount }
      : type === 'add_store'
        ? { extra_store_count: subscription.extra_store_count + amount }
        : { extra_storage_gb: subscription.extra_storage_gb + amount };
    await admin.from('company_subscriptions').update(patch).eq('id', subscription.id);
    await admin.from('plan_change_requests').insert({
      company_id: subscription.company_id,
      tenant_id: subscription.tenant_id,
      requested_by: userData.user.id,
      request_type: type,
      current_plan: subscription.plan,
      requested_extra_staff_count: type === 'add_staff' ? amount : 0,
      requested_extra_store_count: type === 'add_store' ? amount : 0,
      requested_extra_storage_gb: type === 'add_storage' ? amount : 0,
      message: '追加枠を即時反映。追加料金は次回請求から（途中精算なし）。',
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, message: '追加枠を反映しました。追加料金は次回請求からです。' });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '追加オプションの反映に失敗しました。' },
      { status: 502 },
    );
  }
}
