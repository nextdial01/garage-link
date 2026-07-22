import { logAudit } from '@/lib/audit/logAudit';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = { store_id: string; role: string | null };

export async function GET(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return Response.json({ error: 'ログインが必要です。' }, { status: 401 });

  const { data: member } = await supabase.from<StoreMemberRow>('store_members').select('store_id, role').eq('user_id', userData.user.id).single();
  if (!member?.store_id || (member.role !== 'owner' && member.role !== 'admin')) return Response.json({ error: '権限がありません。' }, { status: 403 });

  const admin = createAdminClient();
  const stripe = getStripeClient();
  if (!admin || !stripe) return Response.json({ error: '請求機能が設定されていません。' }, { status: 503 });

  const { data: activeStore } = await admin.from('stores').select('tenant_id').eq('id', member.store_id).single();
  const tenantId = (activeStore as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId) return Response.json({ error: '契約会社を特定できません。' }, { status: 500 });
  const { data: subscription } = await admin.from('company_subscriptions').select('stripe_customer_id').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const customerId = (subscription as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (!customerId) return Response.json({ error: '請求書が見つかりません。' }, { status: 404 });

  const { invoiceId } = await context.params;
  const invoice = await stripe.invoices.retrieve(invoiceId).catch(() => null);
  if (!invoice) return Response.json({ error: '請求書が見つかりません。' }, { status: 404 });
  const invoiceCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (invoiceCustomerId !== customerId || !invoice.invoice_pdf) return Response.json({ error: '請求書が見つかりません。' }, { status: 404 });

  const auditLogged = await logAudit({
    supabase: admin,
    storeId: member.store_id,
    userId: userData.user.id,
    userEmail: userData.user.email ?? null,
    userRole: member.role,
    action: 'view_billing_invoice',
    targetType: 'billing_invoice',
    targetId: invoice.id,
    targetLabel: invoice.number ?? 'Stripe invoice',
    metadata: { amount: invoice.total, currency: invoice.currency },
    userAgent: request.headers.get('user-agent'),
  });
  if (!auditLogged) return Response.json({ error: '監査記録を保存できないため、請求書を開けません。' }, { status: 503 });
  return Response.redirect(invoice.invoice_pdf, 302);
}
