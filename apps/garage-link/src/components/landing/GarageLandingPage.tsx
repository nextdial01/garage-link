import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CarFront,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Gauge,
  ShieldCheck,
  Upload,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import { GARAGE_PLAN_ORDER, GARAGE_PLANS } from '@/lib/billing/garagePlans';
import { MobileNavigation } from './MobileNavigation';
import { ProductShowcase } from './ProductShowcase';
import { TrackedInquiryLink, TrackedLoginLink, TrackedSignupLink } from './TrackedSignupLink';
import styles from './garage-landing.module.css';

const beforeAfter = [
  {
    before: '在庫はExcel、顧客は別台帳',
    after: '車両・顧客・商談を同じ店舗台帳へ',
  },
  {
    before: '見積・請求で同じ情報を再入力',
    after: '登録済みの車両・顧客情報を業務へつなぐ',
  },
  {
    before: '担当者しか次の連絡日を知らない',
    after: '来店・連絡・納車・期限を店舗で共有',
  },
  {
    before: '長期在庫や追客漏れを後から発見',
    after: '今日確認する仕事を先に見つける',
  },
] as const;

const workflow = [
  ['01', '車両', '仕入・原価・在庫状態'],
  ['02', '顧客', '問い合わせ・希望条件'],
  ['03', '商談', '見積・次回連絡'],
  ['04', '整備', '作業・部品・納車予定'],
  ['05', '次回', '点検・車検の期限'],
] as const;

const industries = [
  {
    title: '中古車販売',
    description: '仕入、在庫、問い合わせ、商談、見積、納車までを車両単位で。',
    href: '/industries/used-car',
    icon: CarFront,
  },
  {
    title: '整備工場・車検',
    description: '予約、入庫、作業、部品、請求、次回車検までを一つの案件で。',
    href: '/industries/maintenance',
    icon: Wrench,
  },
  {
    title: 'バイク販売・修理',
    description: '販売車両と修理入庫を分けず、担当者と期限が見える形で共有。',
    href: '/industries/motorcycle',
    icon: Gauge,
  },
] as const;

const fitItems = [
  'Excel・紙・複数の台帳に情報が分かれている',
  '少人数の店舗で、在庫から商談・整備までまとめたい',
  'まず少数の車両で試してから本格導入を判断したい',
  '顧客・車両データをCSVで持ち出せる状態を保ちたい',
] as const;

const notFitItems = [
  '複数の中古車広告媒体へ自動で一括掲載することが最優先',
  'メーカー・FC指定の基幹システムを変更できない',
  '検査ライン機器など専用ハードウェア連携が必須',
  '大規模ディーラー向けDMS・基幹会計の置き換えが目的',
] as const;

const faqItems = [
  {
    q: '無料でどこまで使えますか？',
    a: 'Freeプランは月額0円で、在庫5台、スタッフ1人、1店舗、見積・請求は月5件まで利用できます。登録時にカード情報は不要です。',
  },
  {
    q: 'Excelのデータから始められますか？',
    a: '顧客情報と車両情報はCSVの入出力に対応しています。最初から全件を移さず、販売中の車両1台から試すこともできます。',
  },
  {
    q: '登録後に細かい設定を全部決める必要がありますか？',
    a: 'いいえ。最初は店舗名など最低限を登録し、1台目の車両登録へ進めます。集計基準や主タブなどは後から変更できます。',
  },
  {
    q: 'スタッフごとに見られる範囲を分けられますか？',
    a: 'はい。店舗内の役割に応じて閲覧・操作範囲を分けられます。',
  },
] as const;

const plans = GARAGE_PLAN_ORDER.map((code) => {
  const plan = GARAGE_PLANS[code];
  return {
    code,
    name: plan.name,
    price: plan.monthlyPrice,
    inventory: plan.inventoryLimit,
    staff: plan.includedStaffCount,
    stores: plan.includedStoreCount,
    documents: plan.quoteInvoiceLimit === null ? '上限なし' : `月${plan.quoteInvoiceLimit}件`,
  };
});

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
            <Link href="/demo">実画面</Link>
            <a href="#features">機能</a>
            <a href="#industries">業種別</a>
            <Link href="/pricing">料金</Link>
            <Link href="/faq">FAQ</Link>
            <TrackedInquiryLink placement="header_inquiry">お問い合わせ</TrackedInquiryLink>
          </nav>
          <TrackedLoginLink className={styles.loginLink}>ログイン</TrackedLoginLink>
          <TrackedSignupLink placement="header" className={styles.headerCta}>無料で試す</TrackedSignupLink>
          <MobileNavigation />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroLayout}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>中古車販売・整備工場・バイク店向け</p>
              <h1>車屋の在庫・顧客・商談・整備を、<br />1台の車両からひとつに。</h1>
              <p className={styles.heroLead}>
                Excel、紙、個人メモに散らばる情報をGARAGE LINKへ。
                <br className={styles.desktopBreak} />
                今日やる仕事と、その車両の履歴を同じ店舗台帳で確認できます。
              </p>
              <div className={styles.heroActions}>
                <Link href="/demo" className={styles.primaryCta}>
                  実際の画面を60秒で見る <ArrowRight aria-hidden="true" />
                </Link>
                <TrackedSignupLink placement="hero" className={styles.secondaryCta}>無料で試す</TrackedSignupLink>
              </div>
              <div className={styles.heroTerms} aria-label="無料プランの条件">
                <span><Check aria-hidden="true" /> 月額0円</span>
                <span><Check aria-hidden="true" /> カード登録不要</span>
                <span><Check aria-hidden="true" /> 在庫5台まで</span>
              </div>
            </div>
            <ProductShowcase />
          </div>
        </div>
      </section>

      <section className={styles.quickProof} aria-label="GARAGE LINKの要点">
        <div className={styles.container}>
          <div className={styles.quickProofGrid}>
            <div><strong>実画面を公開</strong><span>登録前に製品UIを確認</span></div>
            <div><strong>顧客・車両CSV</strong><span>入出力に対応</span></div>
            <div><strong>役割別の権限</strong><span>スタッフごとに操作範囲を分離</span></div>
            <div><strong>Freeから開始</strong><span>必要になってからプラン変更</span></div>
          </div>
        </div>
      </section>

      <section className={styles.problemSection} id="features" aria-labelledby="problem-title">
        <div className={styles.container}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionKicker}>BEFORE / AFTER</p>
            <h2 id="problem-title">「どこにある？」を減らすための店舗台帳。</h2>
            <p>機能を増やすことより、車両に関する情報を探し直さない状態を作ることを優先しています。</p>
          </div>
          <div className={styles.compareGrid}>
            <div className={styles.compareColumn}>
              <span className={styles.compareLabel}>いま起きやすいこと</span>
              {beforeAfter.map((item) => (
                <div className={styles.compareRowMuted} key={item.before}>
                  <X aria-hidden="true" />
                  <span>{item.before}</span>
                </div>
              ))}
            </div>
            <div className={styles.compareColumnStrong}>
              <span className={styles.compareLabel}>GARAGE LINK</span>
              {beforeAfter.map((item) => (
                <div className={styles.compareRowStrong} key={item.after}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{item.after}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.workflowSection} aria-labelledby="workflow-title">
        <div className={styles.container}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionKicker}>ONE VEHICLE, ONE FLOW</p>
            <h2 id="workflow-title">1台の車両に、仕事の続きが残る。</h2>
            <p>在庫だけ、顧客だけではなく、問い合わせから納車後の期限までを同じ流れで確認します。</p>
          </div>
          <ol className={styles.workflowRail}>
            {workflow.map(([number, title, body]) => (
              <li key={number}>
                <span>{number}</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </li>
            ))}
          </ol>
          <div className={styles.workflowCta}>
            <Link href="/demo">3つの実画面を見る <ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className={styles.industrySection} id="industries" aria-labelledby="industry-title">
        <div className={styles.container}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionKicker}>FOR YOUR BUSINESS</p>
            <h2 id="industry-title">業態ごとに、最初に見る画面が違う。</h2>
            <p>同じ機能一覧を押し付けず、店舗の仕事に近い入口から確認できます。</p>
          </div>
          <div className={styles.industryGrid}>
            {industries.map((industry) => {
              const Icon = industry.icon;
              return (
                <Link href={industry.href} className={styles.industryCard} key={industry.title}>
                  <span className={styles.industryIcon}><Icon aria-hidden="true" /></span>
                  <h3>{industry.title}</h3>
                  <p>{industry.description}</p>
                  <strong>詳しく見る <ArrowRight aria-hidden="true" /></strong>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.migrationSection} aria-labelledby="migration-title">
        <div className={styles.container}>
          <div className={styles.migrationLayout}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>START SMALL</p>
              <h2 id="migration-title">全部移してから試す必要はありません。</h2>
              <p>まず1台。合わなければそこで止める。既存データがある場合は顧客・車両CSVを使えます。</p>
            </div>
            <div className={styles.migrationSteps}>
              <article>
                <span><FileSpreadsheet aria-hidden="true" /></span>
                <div><strong>既存データがある</strong><p>顧客・車両CSVをプレビューしてから取り込み。CSV出力にも対応しています。</p></div>
              </article>
              <article>
                <span><CarFront aria-hidden="true" /></span>
                <div><strong>まず試したい</strong><p>販売中・入庫中の車両を1台だけ登録し、実際の操作で判断できます。</p></div>
              </article>
              <article>
                <span><Upload aria-hidden="true" /></span>
                <div><strong>細かい設定は後で</strong><p>集計基準や主タブなどは後から変更可能。最初の設定量を抑えています。</p></div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.fitSection} aria-labelledby="fit-title">
        <div className={styles.container}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionKicker}>FIT CHECK</p>
            <h2 id="fit-title">向いている店も、向かない店も先に書きます。</h2>
            <p>登録件数を増やすより、実際に使える店舗へ届くことを優先します。</p>
          </div>
          <div className={styles.fitGrid}>
            <article className={styles.fitGood}>
              <h3><CheckCircle2 aria-hidden="true" /> 向いている店舗</h3>
              <ul>{fitItems.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article className={styles.fitOther}>
              <h3><ShieldCheck aria-hidden="true" /> 他サービスも比較した方がよい店舗</h3>
              <ul>{notFitItems.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.pricingSection} aria-labelledby="pricing-title">
        <div className={styles.container}>
          <div className={styles.pricingHeader}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>PRICING</p>
              <h2 id="pricing-title">月額0円から。規模が増えたら変更。</h2>
              <p>最初から有料契約を前提にしません。Freeで店舗業務に合うか確認できます。</p>
            </div>
            <Link href="/pricing" className={styles.textLink}>料金の詳細を見る <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <article className={plan.code === 'free' ? styles.planFeatured : styles.planCard} key={plan.code}>
                <div className={styles.planTop}>
                  <span>{plan.name}</span>
                  {plan.code === 'free' && <em>まず試す</em>}
                </div>
                <p className={styles.planPrice}><strong>{plan.price.toLocaleString('ja-JP')}</strong><span>円 / 月</span></p>
                <ul>
                  <li>在庫 {plan.inventory}台</li>
                  <li>スタッフ {plan.staff}人</li>
                  <li>{plan.stores}店舗</li>
                  <li>見積・請求 {plan.documents}</li>
                </ul>
              </article>
            ))}
          </div>
          <p className={styles.pricingNote}>有料プランの表示額は10%相当額を含む請求総額です。</p>
        </div>
      </section>

      <section className={styles.trustSection} aria-labelledby="trust-title">
        <div className={styles.container}>
          <div className={styles.trustLayout}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>TRUST</p>
              <h2 id="trust-title">実績を大きく見せる代わりに、確認できる事実を出します。</h2>
              <p>まだ大手SaaSのような導入社数や大量レビューはありません。だから製品画面、料金、データの扱い、運営会社を公開します。</p>
            </div>
            <div className={styles.trustGrid}>
              <article><span><FileText aria-hidden="true" /></span><strong>利用条件を公開</strong><p>料金、Free上限、利用規約、プライバシーポリシーを登録前に確認できます。</p></article>
              <article><span><FileSpreadsheet aria-hidden="true" /></span><strong>CSVで持ち出せる</strong><p>顧客・車両情報はCSV出力に対応。データを閉じ込めない運用を選べます。</p></article>
              <article><span><UsersRound aria-hidden="true" /></span><strong>権限を分ける</strong><p>店舗内の役割に応じて、スタッフの閲覧・操作範囲を分けられます。</p></article>
              <article><span><Building2 aria-hidden="true" /></span><strong>株式会社かんなぎが運営</strong><p>問い合わせ窓口と法務情報を公開し、登録前でも確認できる状態にしています。</p></article>
            </div>
            <div className={styles.trustActions}>
              <TrackedInquiryLink placement="trust_inquiry" className={styles.outlineButton}>登録前に問い合わせる</TrackedInquiryLink>
              <Link href="/legal/privacy" className={styles.textLink}>プライバシーポリシー</Link>
              <Link href="/legal/terms" className={styles.textLink}>利用規約</Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.faqSection} aria-labelledby="faq-title">
        <div className={styles.container}>
          <div className={styles.sectionIntro}>
            <p className={styles.sectionKicker}>FAQ</p>
            <h2 id="faq-title">登録前によく確認されること。</h2>
          </div>
          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <details key={item.q}>
                <summary>{item.q}<span aria-hidden="true">＋</span></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
          <Link href="/faq" className={styles.textLink}>FAQをすべて見る <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>

      <section className={styles.finalSection} aria-labelledby="final-title">
        <div className={styles.finalGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.finalLayout}>
            <div>
              <p className={styles.sectionKicker}>TRY THE PRODUCT</p>
              <h2 id="final-title">まず画面を見る。合いそうなら1台だけ試す。</h2>
              <p>月額0円・カード登録不要。在庫5台までFreeで利用できます。</p>
            </div>
            <div className={styles.finalActions}>
              <Link href="/demo" className={styles.finalPrimary}>実際の画面を見る <ArrowRight aria-hidden="true" /></Link>
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
              <Link href="/help">ヘルプ</Link>
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

      <Link href="/demo" className={styles.mobileStickyCta}>実画面を見る</Link>
    </main>
  );
}
