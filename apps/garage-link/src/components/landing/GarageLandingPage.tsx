import Link from 'next/link';
import { Suspense } from 'react';
import {
  ArrowRight,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import { GARAGE_PLANS } from '@/lib/billing/garagePlans';
import { MobileNavigation } from './MobileNavigation';
import { MobileStickyDemoCta } from './MobileStickyDemoCta';
import { GarageInteractiveDemo } from './demo/GarageInteractiveDemo';
import { GarageScrollStory } from './GarageScrollStory';
import { TrackedInquiryLink, TrackedLoginLink, TrackedSignupLink } from './TrackedSignupLink';
import styles from './garage-landing.module.css';



const faqItems = [
  {
    q: '無料でどこまで使えますか？',
    a: '在庫5台、1人・1店舗、見積・請求は月5件まで。',
  },
  {
    q: 'Excelから移せますか？',
    a: '顧客・車両をCSVで移せます。',
  },
  {
    q: 'デモで作ったデータは保存されますか？',
    a: '保存されません。実データは無料登録後に。',
  },
] as const;

const freePlan = GARAGE_PLANS.free;

export function GarageLandingPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GARAGE LINK',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: '中古車販売店・バイク販売修理店・整備工場向けの店舗管理システム。車両在庫、顧客、商談、見積・請求、整備、次回期限を一つの店舗台帳で管理します。',
    url: 'https://garage-link.tech/',
    provider: { '@type': 'Organization', name: '株式会社かんなぎ' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY', description: 'Freeプラン' },
  };

  return (
    <main className={styles.page}>
      <AcquisitionPageTracker source="landing" placement="home" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label="GARAGE LINK トップページ" className={styles.brand}>
            <BrandLogo className={styles.brandLogo} priority />
          </Link>
          <nav className={styles.nav} aria-label="メインナビゲーション">
            <a href="#live-demo">デモ</a>
            <a href="#product-story">体験</a>
            <Link href="/pricing">料金</Link>
            <Link href="/faq">FAQ</Link>
            <TrackedInquiryLink placement="header_inquiry">お問い合わせ</TrackedInquiryLink>
          </nav>
          <TrackedLoginLink className={styles.loginLink}>ログイン</TrackedLoginLink>
          <TrackedSignupLink placement="header" className={styles.headerCta}>無料で始める</TrackedSignupLink>
          <MobileNavigation />
        </div>
      </header>

      <section className={styles.hero} id="garage-hero">
        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>中古車・バイク販売店・整備工場の店舗管理</p>
          <h1><span>車両を中心に、</span><span>仕事をひとつに。</span></h1>
          <p className={styles.heroLead}>
            在庫から整備まで、この画面で。
          </p>
          <div className={styles.heroActions}>
            <TrackedSignupLink placement="hero" className={styles.primaryCta}>無料で始める <ArrowRight aria-hidden="true" /></TrackedSignupLink>
            <a href="#product-story" className={styles.secondaryCta}>製品を見る</a>
          </div>
        </div>
      </section>

      <GarageScrollStory />

      <section className={styles.demoSection} id="live-demo">
        <div className={styles.demoRail}>
          <div>
            <h2>次は、あなたが動かす。</h2>
          </div>
          <a href="/demo" className={styles.demoOpen}>デモを広く開く ↗</a>
        </div>
        <div className={styles.demoContainer}>
          <Suspense fallback={<div className={styles.demoLoading}>デモを準備しています...</div>}>
            <GarageInteractiveDemo />
          </Suspense>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className={styles.pricingGrid}>
          <h2>Freeで始める。</h2>
          <div className={styles.freePricePanel}>
            <div><strong>0</strong><span>円 / 月</span></div>
            <p>カード不要</p>
            <ul>
              <li>在庫 {freePlan.inventoryLimit}台</li>
              <li>{freePlan.includedStaffCount}人・1店舗</li>
              <li>見積・請求 月{freePlan.quoteInvoiceLimit}件</li>
            </ul>
            <TrackedSignupLink placement="pricing_free" className={styles.pricingCta}>Freeで始める <ArrowRight aria-hidden="true" /></TrackedSignupLink>
            <Link href="/pricing" className={styles.pricingDetail}>全プランを見る</Link>
          </div>
        </div>
      </section>

      <section className={styles.migrationSection} id="migration">
        <div className={styles.migrationGrid}>
          <h2>まず1台。移行はCSVで。</h2>
          <p>顧客・車両の入出力に対応。</p>
        </div>
      </section>

      <section className={styles.faqSection} id="faq">
        <div className={styles.faqGrid}>
          <div>
            <h2>よくある質問</h2>
          </div>
          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <details key={item.q}>
                <summary>{item.q}<span aria-hidden="true">＋</span></summary>
                <p>{item.a}</p>
              </details>
            ))}
            <Link href="/faq" className={styles.faqMore}>FAQをすべて見る <ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className={styles.finalSection} id="final-cta">
        <div>
          <h2>店の仕事を、ひとつに。</h2>
        </div>
        <div className={styles.finalActions}>
          <TrackedSignupLink placement="final" className={styles.finalPrimary}>無料で始める <ArrowRight aria-hidden="true" /></TrackedSignupLink>
          <a href="#live-demo" className={styles.finalSecondary}>デモを操作する</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <BrandLogo className={styles.footerLogo} />
          <nav aria-label="フッターナビゲーション">
            <a href="#live-demo">デモ</a>
            <Link href="/features">機能</Link>
            <Link href="/pricing">料金</Link>
            <Link href="/faq">FAQ</Link>
            <TrackedInquiryLink placement="footer_inquiry">お問い合わせ</TrackedInquiryLink>
          </nav>
        </div>
        <div className={styles.footerBottom}>
          <p>© 株式会社かんなぎ</p>
          <nav aria-label="法務情報">
            <Link href="/legal/terms">利用規約</Link>
            <Link href="/legal/privacy">プライバシーポリシー</Link>
            <Link href="/legal/tokusho">特定商取引法に基づく表記</Link>
          </nav>
        </div>
      </footer>

      <MobileStickyDemoCta />
    </main>
  );
}
