import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { L_LINK_PLANS } from "@garage-link/billing";

function formatLimit(value: number | null, unit: string) {
  return value === null ? "無制限" : `${value.toLocaleString("ja-JP")}${unit}`;
}

export default function BillingPage() {
  const plans = Object.values(L_LINK_PLANS);

  return (
    <LLinkShell title="契約・プラン" description="L-Link単体SaaSの友だち管理・配信機能を中心にした料金設計です。">
      <div className="space-y-5">
        <UiCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <UiBadge tone="green">初期ローンチ</UiBadge>
            <h2 className="mt-3 text-2xl font-black text-slate-950">商品・決済ではなく、友だち管理と配信運用を優先します</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              初期スコープでは商品管理、注文管理、Stripe決済、ASP管理は扱いません。友だち数、月間配信数、フォーム、リッチメニュー、ステップ配信、スタッフ数を中心に管理します。
            </p>
          </div>
        </div>
        </UiCard>

        <UiCard className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">項目</th>
                  {plans.map((plan) => <th key={plan.code} className="px-4 py-3">{plan.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr><th className="px-4 py-3 text-left">月額</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3 font-bold">{plan.monthlyPrice.toLocaleString("ja-JP")}円</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">友だち数</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{formatLimit(plan.friendLimit, "人")}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">月間配信数</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{formatLimit(plan.monthlyDeliveryLimit, "通")}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">フォーム数</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{formatLimit(plan.formLimit, "個")}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">リッチメニュー数</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{formatLimit(plan.richMenuLimit, "個")}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">ステップ配信数</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{formatLimit(plan.stepScenarioLimit, "本")}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">シナリオ分岐</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{plan.scenarioBranchEnabled ? "可" : "不可"}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">予約配信</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{plan.scheduledDeliveryEnabled ? "可" : "不可"}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">スタッフ数</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{formatLimit(plan.staffLimit, "名")}</td>)}</tr>
                <tr><th className="px-4 py-3 text-left">LINE公式アカウント数</th>{plans.map((plan) => <td key={plan.code} className="px-4 py-3">{plan.lineAccountLimit}件</td>)}</tr>
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
