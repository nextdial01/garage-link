import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createLLinkServiceClient, getDemoCompanyId } from "@/lib/supabase/server";

async function countRows(table: string, companyId: string) {
  const supabase = createLLinkServiceClient();
  if (!supabase) return 0;
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);
  return count ?? 0;
}

async function getMetrics() {
  const companyId = getDemoCompanyId();
  if (!companyId) {
    return [
      ["友だち数", "0"],
      ["今月の配信数", "0"],
      ["フォーム回答数", "0"],
      ["未対応問い合わせ", "0"],
    ];
  }

  const [friends, deliveryCounts, formAnswers] = await Promise.all([
    countRows("ll_line_friends", companyId),
    countRows("ll_delivery_counts", companyId),
    countRows("ll_form_answers", companyId),
  ]);

  return [
    ["友だち数", String(friends)],
    ["今月の配信数", String(deliveryCounts)],
    ["フォーム回答数", String(formAnswers)],
    ["未対応問い合わせ", "0"],
  ];
}

export default async function DashboardPage() {
  const metrics = await getMetrics();

  return (
    <LLinkShell title="ダッシュボード" description="L-Link単体パッケージの利用状況を確認します。">
      <section className="grid gap-4 md:grid-cols-4">
        {metrics.map(([label, value]) => (
          <UiCard key={label} className="p-5">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          </UiCard>
        ))}
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <UiCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">メッセージ配信</h2>
            <UiBadge tone="green">準備中</UiBadge>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            下書き、テスト配信、配信前確認、本配信をL-Link側で扱うための検証枠です。
          </p>
        </UiCard>
        <UiCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">問い合わせ管理</h2>
            <UiBadge tone="slate">準備中</UiBadge>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            LINE単体パッケージで利用予定です。GARAGE LINK専用機能には依存しません。
          </p>
        </UiCard>
      </section>
    </LLinkShell>
  );
}
