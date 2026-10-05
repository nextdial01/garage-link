import Link from 'next/link';
import { Suspense } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  ShieldCheck,
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
    a: 'Freeプランは在庫5台、スタッフ1人、1店舗、見積・請求は月5件まで。登録時にカード情報は不要です。',
  },
  {
    q: 'Excelから移せますか？',
    a: '顧客・車両はCSVの入出力に対応しています。最初から全件を移さず、1台だけ登録して試すこともできます。',
  },
  {
    q: 'デモで作ったデータは保存されますか？',
    a: '保存されません。LP上のデモはブラウザ内だけで動きます。無料登録後に実データの利用へ切り替わります。',
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
          <p className={styles.heroEyebrow}>中古車販売店・バイク店・整備工場のための店舗管理</p>
          <h1><span>車両を中心に、</span><span>仕事をひとつに。</span></h1>
          <p className={styles.heroLead}>
            在庫、顧客、商談、見積、整備。1台の車両に関わる仕事を、ひと続きの流れで管理します。
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
            <p>自由操作デモ</p>
            <h2>自分の業務に合わせて試す。</h2>
          </div>
          <span>業態や管理方法を選び、デモデータを作って操作できます。</span>
        </div>
        <div className={styles.demoContainer}>
          <Suspense fallback={<div className={styles.demoLoading}>デモを準備しています...</div>}>
            <GarageInteractiveDemo />
          </Suspense>
        </div>
      </section>

      <section className={styles.migrationSection} id="migration">
        <div className={styles.migrationGrid}>
          <div>
            <h2>全部移してから試す必要はありません。</h2>
            <p>まず1台。必要になったらCSV。合わなければ止める。導入判断の前に大仕事を作りません。</p>
          </div>
          <div className={styles.migrationSteps}>
            <div><span>01</span><strong>1台だけ登録</strong><small>販売中・入庫中の車から</small></div>
            <div><span>02</span><strong>必要ならCSV</strong><small>顧客・車両を入出力</small></div>
            <div><span>03</span><strong>設定は後から</strong><small>集計基準や表示を調整</small></div>
          </div>
        </div>
      </section>

      <section className={styles.pricingSection} id="pricing">
        <div className={styles.pricingGrid}>
          <div>
            <h2>まず実際の業務で使ってから判断。</h2>
            <p>登録時にカード情報は不要です。</p>
          </div>
          <div className={styles.freePricePanel}>
            <div>
              <strong>0</strong><span>円 / 月</span>
            </div>
            <ul>
              <li>在庫 {freePlan.inventoryLimit}台</li>
              <li>スタッフ {freePlan.includedStaffCount}人</li>
              <li>1店舗</li>
              <li>見積・請求 月{freePlan.quoteInvoiceLimit}件</li>
            </ul>
            <TrackedSignupLink placement="pricing_free" className={styles.pricingCta}>Freeで始める <ArrowRight aria-hidden="true" /></TrackedSignupLink>
            <Link href="/pricing" className={styles.pricingDetail}>全プランを見る</Link>
          </div>
        </div>
      </section>

      <section className={styles.trustSection}>
        <div className={styles.trustGrid}>
          <div>
            <h2>データを閉じ込めない。</h2>
            <p>顧客・車両はCSVで入出力できます。利用条件、運営会社、問い合わせ窓口も登録前に確認できます。</p>
          </div>
          <div className={styles.trustLinks}>
            <span><FileSpreadsheet aria-hidden="true" /> CSV入出力</span>
            <span><ShieldCheck aria-hidden="true" /> 役割別の権限</span>
            <Link href="/legal/privacy">プライバシー</Link>
            <Link href="/legal/terms">利用規約</Link>
            <TrackedInquiryLink placement="trust_inquiry">お問い合わせ</TrackedInquiryLink>
          </div>
        </div>
      </section>

      <section className={styles.faqSection} id="faq">
        <div className={styles.faqGrid}>
          <div>
            <h2>登録前に確認したいこと。</h2>
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
          <p>無料から、実際の業務で</p>
          <h2>まず触る。合えば、そのまま無料で始める。</h2>
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
