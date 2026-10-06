import Link from 'next/link';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import { PublicSiteHeader, PublicSiteFooter } from '@/components/public-site/PublicSiteChrome';
import { PublicPlanSummary, STANDARD_BASIC_COPY, LLINK_CONNECTION_COPY } from '@/components/public-site/PublicPlanSummary';
import { GarageScrollStory } from './GarageScrollStory';
import { TrackedDemoLink, TrackedSignupLink } from './TrackedSignupLink';
import styles from './garage-landing.module.css';

const faqItems = [
  { q: '無料のまま使えますか？', a: 'Freeは月額0円。在庫5台・スタッフ1人・1店舗、見積・請求は月5件まで使えます。無料登録にカードは不要です。' },
  { q: 'Excelのデータを移せますか？', a: '顧客・車両をCSVで移せます。最初から全部を移す必要はありません。' },
  { q: 'L-LINKはどのプランに含まれますか？', a: `${STANDARD_BASIC_COPY}${LLINK_CONNECTION_COPY}` },
];

export function GarageLandingPage() {
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'GARAGE LINK',
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
    description: '中古車販売店・バイク販売修理店・整備工場向けの店舗管理。車両・顧客・商談・見積・整備をひとつに。',
    url: 'https://garage-link.tech/', provider: { '@type': 'Organization', name: '株式会社かんなぎ' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY', description: 'Freeプラン' },
  };
  return <main className={styles.page}>
    <AcquisitionPageTracker source="landing" placement="home" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <PublicSiteHeader />
    <section className={styles.hero} id="garage-hero">
      <div className={styles.heroInner}>
        <p className={styles.heroEyebrow}>中古車販売店・バイク販売修理店・整備工場へ</p>
        <h1><span>車屋の仕事を、</span><span>1台の車両からひとつに。</span></h1>
        <p className={styles.heroLead}><span>在庫・顧客・商談・見積・整備まで。</span><span>まずは月額0円、カード不要で試せます。</span></p>
        <div className={styles.heroActions}>
          <TrackedSignupLink placement="hero" className={styles.primaryCta}>無料で始める <span aria-hidden="true">→</span></TrackedSignupLink>
          <TrackedDemoLink placement="hero_demo" className={styles.secondaryCta}>触って確かめる</TrackedDemoLink>
        </div>
      </div>
    </section>
    <GarageScrollStory />
    <section className={styles.connectedSection} id="live-demo">
      <div className={styles.connectedInner}>
        <h2><span>探し直さない。</span><span>同じ1台で、次の仕事へ。</span></h2>
        <p>顧客から商談へ。見積から整備へ。</p>
        <div className={styles.heroActions}>
          <TrackedSignupLink placement="product_story" className={styles.primaryCta}>無料で始める <span aria-hidden="true">→</span></TrackedSignupLink>
          <TrackedDemoLink placement="product_demo" className={styles.secondaryCta}>触って確かめる</TrackedDemoLink>
        </div>
        <p className={styles.smallNote}>デモのデータは保存されません。</p>
      </div>
    </section>
    <section className={styles.freeSection} id="free-start">
      <div className={styles.freeInner}>
        <div className={styles.freeStatement}><p>今日使う1台から。</p><h2>試すのに、<br />カードはいりません。</h2></div>
        <div className={styles.freeNumber}><span>Free</span><div><strong>0</strong><span>円／月</span></div><p>在庫5台 · スタッフ1人 · 1店舗<br />見積・請求 月5件</p></div>
      </div>
    </section>
    <section className={styles.standardSection} id="standard-value">
      <div className={styles.standardInner}>
        <p className={styles.standardLabel}>スタンダードプランで広がること</p>
        <h2><span>LINE対応まで、</span><span>別の仕組みを増やさない。</span></h2>
        <div className={styles.serviceRoles}><p><strong>GARAGE LINK</strong><span>店舗の仕事をまとめる</span></p><span className={styles.servicePlus} aria-hidden="true">＋</span><p><strong>L-LINK Basic</strong><span>LINEでの受付・案内</span></p></div>
        <p className={styles.basicCopy}>{STANDARD_BASIC_COPY}</p>
        <p className={styles.readinessNote}>{LLINK_CONNECTION_COPY}</p>
      </div>
    </section>
    <section className={styles.pricingSection} id="pricing">
      <div className={styles.pricingInner}>
        <div className={styles.pricingTitle}><h2>店の広がりに合わせて。</h2><Link href="/pricing">全プランを見る →</Link></div>
        <PublicPlanSummary />
        <p className={styles.smallNote}>有料プランは、基準料金に10%相当額を加えた請求総額です。</p>
        <TrackedSignupLink placement="pricing_free" className={styles.primaryCta}>無料で始める <span aria-hidden="true">→</span></TrackedSignupLink>
      </div>
    </section>
    <section className={styles.migrationSection} id="migration">
      <div className={styles.migrationGrid}><span className={styles.migrationOne} aria-hidden="true">1</span><div><h2>まず1台。移行はCSVで。</h2><p>顧客・車両をまとめて移せます。</p><Link href="/help">使い始め方を見る →</Link></div></div>
    </section>
    <section className={styles.faqSection} id="faq"><div className={styles.faqGrid}>
      <h2>始める前に、気になること。</h2>
      <div className={styles.faqList}>{faqItems.map(item => <details key={item.q}><summary>{item.q}<span aria-hidden="true">＋</span></summary><p>{item.a}</p></details>)}</div>
      <Link href="/faq" className={styles.faqMore}>ほかの質問を見る →</Link>
    </div></section>
    <section className={styles.finalSection} id="final-cta">
      <p>月額0円・カード登録不要</p><h2><span>明日の仕事を、</span><span>今日の1台から。</span></h2>
      <div className={styles.finalActions}><TrackedSignupLink placement="final" className={styles.finalPrimary}>無料で始める <span aria-hidden="true">→</span></TrackedSignupLink><TrackedDemoLink placement="final_demo" className={styles.finalSecondary}>触って確かめる</TrackedDemoLink></div>
    </section>
    <PublicSiteFooter />
  </main>;
}
