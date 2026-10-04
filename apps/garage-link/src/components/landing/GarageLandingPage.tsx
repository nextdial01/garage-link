import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CarFront,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  StickyNote,
  Upload,
  UsersRound,
  Wrench,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import { GARAGE_PLANS } from '@/lib/billing/garagePlans';
import { LandingMotion } from './LandingMotion';
import { MobileNavigation } from './MobileNavigation';
import { MobileStickyDemoCta } from './MobileStickyDemoCta';
import { ProductShowcase } from './ProductShowcase';
import { TrackedInquiryLink, TrackedLoginLink, TrackedSignupLink } from './TrackedSignupLink';
import styles from './garage-landing.module.css';

const flowSources = [
  { label: 'Excel', icon: FileSpreadsheet },
  { label: '紙の台帳', icon: FileText },
  { label: '個人メモ', icon: StickyNote },
  { label: '別々の連絡履歴', icon: MessageSquareText },
] as const;

const flowOutputs = [
  { label: '顧客', icon: UsersRound },
  { label: '商談・見積', icon: ReceiptText },
  { label: '整備', icon: Wrench },
  { label: '次回期限', icon: CalendarClock },
] as const;

const productScenes = [
  {
    number: '01',
    kicker: 'REGISTER',
    title: 'まず、1台を登録する。',
    body: '仕入・販売価格、車両情報、古物情報まで、販売中の1台から始められます。',
    points: ['過去データを全部移さなくていい', '登録した車両を商談・見積へつなげる'],
    src: '/product-screens/vehicle-entry.png',
    alt: 'GARAGE LINKの車両登録画面',
    scene: 'vehicle',
  },
  {
    number: '02',
    kicker: 'TODAY',
    title: '次に動く仕事が見える。',
    body: '来店・試乗・整備予約を、担当者と対象車両まで含めて確認します。',
    points: ['今日の予約と未完了を確認', '顧客と車両へそのまま移動'],
    src: '/product-screens/appointments.png',
    alt: 'GARAGE LINKの来店・試乗予約画面',
    scene: 'appointments',
  },
  {
    number: '03',
    kicker: 'CHECK',
    title: '在庫と商談の詰まりを見落とさない。',
    body: '登録したデータから、在庫・顧客・商談・整備の状況を店舗単位で確認します。',
    points: ['長期在庫や商談状況を確認', '感覚ではなく同じデータから判断'],
    src: '/product-screens/analytics.png',
    alt: 'GARAGE LINKの分析画面',
    scene: 'analytics',
  },
] as const;

const industries = [
  { label: '中古車販売', href: '/industries/used-car', sub: '在庫 → 商談 → 納車' },
  { label: '整備工場・車検', href: '/industries/maintenance', sub: '予約 → 作業 → 次回車検' },
  { label: 'バイク販売・修理', href: '/industries/motorcycle', sub: '販売車両 + 修理入庫' },
] as const;

const fitItems = [
  'Excel・紙・複数台帳に情報が分かれている',
  '少人数で在庫・顧客・商談・整備を共有したい',
  'まず少数の車両で試してから判断したい',
] as const;

const notFitItems = [
  '広告媒体への自動一括掲載だけが最優先',
  'メーカー・FC指定の基幹システムを変更できない',
  '専用ハードウェアや大規模DMS連携が必須',
] as const;

const faqItems = [
  {
    q: '無料でどこまで使えますか？',
    a: 'Freeプランは月額0円で、在庫5台、スタッフ1人、1店舗、見積・請求は月5件まで利用できます。登録時にカード情報は不要です。',
  },
  {
    q: 'Excelから始められますか？',
    a: '顧客情報と車両情報はCSVの入出力に対応しています。まず1台だけ登録して試すこともできます。',
  },
  {
    q: '最初に細かい設定が必要ですか？',
    a: 'いいえ。店舗名など最低限を登録したら、先に1台目の車両登録へ進めます。集計基準などは後から変更できます。',
  },
] as const;

const freePlan = GARAGE_PLANS.free;
const paidPlans = [GARAGE_PLANS.starter, GARAGE_PLANS.standard, GARAGE_PLANS.pro];

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
      <LandingMotion />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label="GARAGE LINK トップページ" className={styles.brand}>
            <BrandLogo className={styles.brandLogo} priority />
          </Link>
          <nav className={styles.nav} aria-label="メインナビゲーション">
            <Link href="/demo">実画面</Link>
            <a href="#product">使い方</a>
            <a href="#industries">業種別</a>
            <Link href="/pricing">料金</Link>
            <TrackedInquiryLink placement="header_inquiry">お問い合わせ</TrackedInquiryLink>
          </nav>
          <TrackedLoginLink className={styles.loginLink}>ログイン</TrackedLoginLink>
          <TrackedSignupLink placement="header" className={styles.headerCta}>無料で試す</TrackedSignupLink>
          <MobileNavigation />
        </div>
      </header>

      <section className={styles.hero} id="garage-hero">
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroLayout}>
            <div className={styles.heroCopy} data-lp-reveal>
              <p className={styles.eyebrow}>中古車販売・整備工場・バイク店向け</p>
              <h1>
                <span>在庫・顧客・商談を、</span>
                <span>整備まで、</span>
                <span>1台の車両につなぐ。</span>
              </h1>
              <p className={styles.heroLead}>
                Excel、紙、個人メモに散らばる情報をGARAGE LINKへ。
                今日やる仕事と、その車両の履歴を同じ店舗台帳で確認できます。
              </p>
              <div className={styles.heroActions}>
                <Link href="/demo" className={styles.primaryCta}>
                  実画面を見る <ArrowRight aria-hidden="true" />
                </Link>
                <TrackedSignupLink placement="hero" className={styles.secondaryCta}>無料で試す</TrackedSignupLink>
              </div>
              <div className={styles.heroTerms} aria-label="無料プランの条件">
                <span><Check aria-hidden="true" /> 月額0円</span>
                <span><Check aria-hidden="true" /> カード登録不要</span>
                <span><Check aria-hidden="true" /> 在庫5台まで</span>
              </div>
            </div>
            <div data-lp-reveal>
              <ProductShowcase />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.proofStrip} aria-label="GARAGE LINKの要点">
        <div className={styles.container}>
          <div className={styles.proofStripInner}>
            <span><strong>実UI</strong> 登録前に確認</span>
            <span><strong>CSV</strong> 顧客・車両を入出力</span>
            <span><strong>権限</strong> スタッフ別に管理</span>
            <span><strong>Free</strong> 必要になるまで0円</span>
          </div>
        </div>
      </section>

      <section className={styles.flowSection} id="product" aria-labelledby="flow-title">
        <div className={styles.container}>
          <div className={styles.flowIntro} data-lp-reveal>
            <p className={styles.sectionKicker}>FROM SCATTERED TO ONE FLOW</p>
            <h2 id="flow-title">バラバラの情報を、車両を中心に戻す。</h2>
          </div>
          <div className={styles.flowDiagram} data-lp-reveal>
            <div className={styles.flowSources} aria-label="現在の管理場所">
              {flowSources.map((item) => {
                const Icon = item.icon;
                return <span key={item.label}><Icon aria-hidden="true" />{item.label}</span>;
              })}
            </div>
            <div className={styles.flowConnector} aria-hidden="true"><i /></div>
            <div className={styles.flowHub}>
              <span><CarFront aria-hidden="true" /></span>
              <strong>1台の車両</strong>
              <small>GARAGE LINK</small>
            </div>
            <div className={styles.flowConnector} aria-hidden="true"><i /></div>
            <div className={styles.flowOutputs} aria-label="つながる業務">
              {flowOutputs.map((item) => {
                const Icon = item.icon;
                return <span key={item.label}><Icon aria-hidden="true" />{item.label}</span>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.scenesSection} aria-label="GARAGE LINKの実画面で見る使い方">
        <div className={styles.container}>
          {productScenes.map((scene, index) => (
            <article
              className={[styles.scene, index % 2 === 1 ? styles.sceneReverse : ''].filter(Boolean).join(' ')}
              key={scene.number}
              data-lp-reveal
            >
              <div className={styles.sceneCopy}>
                <span className={styles.sceneNumber}>{scene.number}</span>
                <p className={styles.sectionKicker}>{scene.kicker}</p>
                <h2>{scene.title}</h2>
                <p>{scene.body}</p>
                <ul>
                  {scene.points.map((point) => <li key={point}><CheckCircle2 aria-hidden="true" />{point}</li>)}
                </ul>
              </div>
              <div className={styles.sceneMedia}>
                <div className={styles.sceneBrowser}>
                  <div className={styles.sceneBrowserBar} aria-hidden="true"><span /><span /><span /></div>
                  <div className={styles.sceneCanvas} data-scene={scene.scene}>
                    <Image src={scene.src} alt={scene.alt} width={1015} height={650} sizes="(max-width: 720px) 760px, 56vw" />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.industryBand} id="industries" aria-labelledby="industries-title">
        <div className={styles.container}>
          <div className={styles.industryBandHeader} data-lp-reveal>
            <p className={styles.sectionKicker}>CHOOSE YOUR WORKFLOW</p>
            <h2 id="industries-title">店の仕事に近い入口から見る。</h2>
          </div>
          <div className={styles.industryLinks} data-lp-reveal>
            {industries.map((industry) => (
              <Link href={industry.href} key={industry.label}>
                <span>{industry.label}</span>
                <small>{industry.sub}</small>
                <ArrowRight aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.startSmallSection} aria-labelledby="start-small-title">
        <div className={styles.container}>
          <div className={styles.startSmallLayout}>
            <div data-lp-reveal>
              <p className={styles.sectionKicker}>START SMALL</p>
              <h2 id="start-small-title">全部移してから試す必要はありません。</h2>
              <p>まず1台。合うと分かってから、必要なデータだけ増やせます。</p>
            </div>
            <ol className={styles.startSteps} data-lp-reveal>
              <li><span><CarFront aria-hidden="true" /></span><strong>1台だけ登録</strong><small>販売中・入庫中の車から</small></li>
              <li><span><FileSpreadsheet aria-hidden="true" /></span><strong>必要ならCSV</strong><small>顧客・車両をプレビューして取込</small></li>
              <li><span><Upload aria-hidden="true" /></span><strong>設定は後から</strong><small>集計基準や主タブを後で調整</small></li>
            </ol>
          </div>
        </div>
      </section>

      <section className={styles.pricingSection} aria-labelledby="pricing-title">
        <div className={styles.container}>
          <div className={styles.pricingLayout}>
            <div className={styles.freePlan} data-lp-reveal>
              <p className={styles.sectionKicker}>FREE PLAN</p>
              <h2 id="pricing-title">まず0円で、実際の店の仕事に使う。</h2>
              <p className={styles.freePrice}><strong>0</strong><span>円 / 月</span></p>
              <ul>
                <li><Check aria-hidden="true" /> 在庫 {freePlan.inventoryLimit}台</li>
                <li><Check aria-hidden="true" /> スタッフ {freePlan.includedStaffCount}人</li>
                <li><Check aria-hidden="true" /> 1店舗</li>
                <li><Check aria-hidden="true" /> 見積・請求 月{freePlan.quoteInvoiceLimit}件</li>
              </ul>
              <TrackedSignupLink placement="pricing_free" className={styles.pricingCta}>Freeで試す <ArrowRight aria-hidden="true" /></TrackedSignupLink>
            </div>
            <div className={styles.paidPlanRail} data-lp-reveal>
              <p>規模が増えたら変更</p>
              {paidPlans.map((plan) => (
                <Link href="/pricing" key={plan.code}>
                  <div><strong>{plan.name}</strong><small>在庫 {plan.inventoryLimit}台 / スタッフ {plan.includedStaffCount}人</small></div>
                  <span>{plan.monthlyPrice.toLocaleString('ja-JP')}円<small>/月</small></span>
                </Link>
              ))}
              <small className={styles.taxNote}>表示額は10%相当額を含む請求総額です。</small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.fitTrustSection} aria-labelledby="fit-title">
        <div className={styles.container}>
          <div className={styles.fitTrustGrid}>
            <div className={styles.fitPanel} data-lp-reveal>
              <p className={styles.sectionKicker}>FIT CHECK</p>
              <h2 id="fit-title">こういう店に向いています。</h2>
              <ul>{fitItems.map((item) => <li key={item}><CheckCircle2 aria-hidden="true" />{item}</li>)}</ul>
            </div>
            <div className={styles.notFitPanel} data-lp-reveal>
              <p className={styles.sectionKicker}>NOT FOR EVERYONE</p>
              <h3>別の専用システムも比較した方がいい場合。</h3>
              <ul>{notFitItems.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
          <div className={styles.trustLine} data-lp-reveal>
            <span><ShieldCheck aria-hidden="true" /><strong>登録前に確認できる</strong></span>
            <Link href="/legal/privacy">プライバシー</Link>
            <Link href="/legal/terms">利用規約</Link>
            <TrackedInquiryLink placement="trust_inquiry">お問い合わせ</TrackedInquiryLink>
            <span className={styles.operator}>運営：株式会社かんなぎ</span>
          </div>
        </div>
      </section>

      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div className={styles.container}>
          <div className={styles.faqLayout}>
            <div data-lp-reveal>
              <p className={styles.sectionKicker}>FAQ</p>
              <h2 id="faq-title">登録前の3つだけ。</h2>
              <Link href="/faq" className={styles.textLink}>FAQをすべて見る <ArrowRight aria-hidden="true" /></Link>
            </div>
            <div className={styles.faqList} data-lp-reveal>
              {faqItems.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}<span aria-hidden="true">＋</span></summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.finalSection} aria-labelledby="final-title">
        <div className={styles.finalGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.finalLayout} data-lp-reveal>
            <div>
              <p className={styles.sectionKicker}>SEE IT BEFORE SIGNUP</p>
              <h2 id="final-title">文字を読むより、実際の画面を見る。</h2>
              <p>合いそうなら、そのまま在庫5台まで月額0円で試せます。</p>
            </div>
            <div className={styles.finalActions}>
              <Link href="/demo" className={styles.finalPrimary}>実画面を見る <ArrowRight aria-hidden="true" /></Link>
              <TrackedSignupLink placement="final" className={styles.finalSecondary}>無料で試す</TrackedSignupLink>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerTop}>
            <BrandLogo className={styles.footerLogo} />
            <nav aria-label="フッターナビゲーション">
              <Link href="/demo">実画面</Link>
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
        </div>
      </footer>

      <MobileStickyDemoCta />
    </main>
  );
}
