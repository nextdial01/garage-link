import LinePackageShell from '@/components/line-package/LinePackageShell';
import { LINE_PLANS, UNLIMITED_DELIVERY_OPTION, formatYen } from '@/lib/billing/linePlans';

const rows = [
  {
    label: '月額',
    free: formatYen(LINE_PLANS.FREE.monthlyPrice),
    basic: formatYen(LINE_PLANS.LINE_BASIC.monthlyPrice),
    auto: formatYen(LINE_PLANS.LINE_AUTO.monthlyPrice),
  },
  {
    label: '月間配信数',
    free: `${LINE_PLANS.FREE.monthlyDeliveryLimit.toLocaleString()}通`,
    basic: `${LINE_PLANS.LINE_BASIC.monthlyDeliveryLimit.toLocaleString()}通`,
    auto: `${LINE_PLANS.LINE_AUTO.monthlyDeliveryLimit.toLocaleString()}通`,
  },
  {
    label: '超過時',
    free: '不可',
    basic: '1,000通ごとに1,000円',
    auto: '1,000通ごとに1,000円',
  },
  {
    label: '通数無制限オプション',
    free: '-',
    basic: `+${formatYen(UNLIMITED_DELIVERY_OPTION.monthlyPrice)}`,
    auto: `+${formatYen(UNLIMITED_DELIVERY_OPTION.monthlyPrice)}`,
  },
  {
    label: '無制限込み月額',
    free: '-',
    basic: formatYen(LINE_PLANS.LINE_BASIC.monthlyPrice + UNLIMITED_DELIVERY_OPTION.monthlyPrice),
    auto: formatYen(LINE_PLANS.LINE_AUTO.monthlyPrice + UNLIMITED_DELIVERY_OPTION.monthlyPrice),
  },
  {
    label: 'リッチメニュー',
    free: '1個',
    basic: '複数',
    auto: '複数',
  },
  {
    label: '回答フォーム',
    free: '1個',
    basic: '複数',
    auto: '複数',
  },
  {
    label: '複数店舗管理',
    free: '-',
    basic: '-',
    auto: '○',
  },
  {
    label: '店舗別配信',
    free: '-',
    basic: '-',
    auto: '○',
  },
  {
    label: '店舗別権限',
    free: '-',
    basic: '-',
    auto: '○',
  },
];

export default function LinePackageBillingPage() {
  return (
    <LinePackageShell
      title="契約・プラン"
      description="LINE単体パッケージの料金プラン、月間配信数、通数無制限オプションを確認します。"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-green-100 bg-white shadow-sm">
          <div className="border-b border-green-50 p-5">
            <h2 className="text-lg font-bold text-slate-950">料金表</h2>
            <p className="mt-1 text-sm text-slate-500">表示価格は税抜です。契約変更・Stripe連携は後工程で実装します。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">項目</th>
                  <th className="px-5 py-4 text-right">FREE</th>
                  <th className="px-5 py-4 text-right">LINE BASIC</th>
                  <th className="px-5 py-4 text-right">LINE AUTO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.label} className="hover:bg-green-50/60">
                    <td className="px-5 py-4 font-bold text-slate-700">{row.label}</td>
                    <td className="px-5 py-4 text-right">{row.free}</td>
                    <td className="px-5 py-4 text-right">{row.basic}</td>
                    <td className="px-5 py-4 text-right">{row.auto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <h2 className="font-bold">注意事項</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>表示価格は税抜です。</li>
            <li>配信数は本サービス上の月間配信上限です。</li>
            <li>LINE公式アカウント側の料金・配信通数は別途発生する場合があります。</li>
            <li>FREEプランは配信数超過時の従量課金・通数無制限オプションに対応していません。</li>
            <li>LINE BASIC / LINE AUTOは、月間配信数を超過した場合、1,000通ごとに追加料金が発生します。</li>
            <li>通数無制限オプション加入時は、本サービス上の月間配信数上限が無制限になります。</li>
          </ul>
        </section>
      </div>
    </LinePackageShell>
  );
}
