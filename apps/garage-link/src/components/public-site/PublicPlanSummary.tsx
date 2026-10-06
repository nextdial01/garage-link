import { GARAGE_PLAN_ORDER, GARAGE_PLANS } from '@/lib/billing/garagePlans';
import styles from './public-cv.module.css';

// Presentation only. Basic inclusion is the Owner-approved commercial rule
// (2026-10-06); it does not enable the separate, still-preparing data integration.
export const STANDARD_BASIC_COPY = 'スタンダードプランなら、L-LINK Basicを追加料金なしで利用できます。';
export const LLINK_CONNECTION_COPY = 'GARAGE LINKとのデータ連携は提供準備中です。連携対象はStandard・Proです。';
const purposes = {
  free: 'まず1台、使って確かめる',
  starter: '店舗管理を広げたい店舗向け',
  standard: 'LINE対応までまとめたい店舗向け',
  pro: '複数店舗で仕事を共有したい店舗向け',
};

export function PublicPlanSummary({ detailed = false }: { detailed?: boolean }) {
  return <div className={styles.planList} data-public-plans>
    {GARAGE_PLAN_ORDER.map(code => {
      const plan = GARAGE_PLANS[code];
      return <section key={code} className={`${styles.planLine} ${code === 'free' ? styles.freePlanLine : ''}`} data-plan={code}>
        <div className={styles.planName}><h3>{plan.name}</h3><p>{purposes[code]}</p></div>
        <div className={styles.planAmount}><strong>{plan.monthlyPrice.toLocaleString('ja-JP')}</strong><span>円／月</span></div>
        <div className={styles.planFacts}>
          <p>在庫{plan.inventoryLimit}台 · スタッフ{plan.includedStaffCount}人 · {plan.includedStoreCount}店舗</p>
          {detailed && <p>見積・請求 {plan.quoteInvoiceLimit === null ? '上限なし' : `月${plan.quoteInvoiceLimit}件`}</p>}
          {code === 'free' && <p>カード登録不要{!detailed && ` · 見積・請求 月${plan.quoteInvoiceLimit}件`}</p>}
          {code === 'standard' && <p className={styles.included}>L-LINK Basic付帯 · 追加料金なし</p>}
          {code === 'pro' && detailed && <p className={styles.note}>L-LINK連携対象（提供準備中）</p>}
        </div>
      </section>;
    })}
  </div>;
}
