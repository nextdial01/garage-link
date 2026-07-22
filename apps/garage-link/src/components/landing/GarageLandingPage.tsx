import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BadgeJapaneseYen,
  Bike,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  MessageSquareText,
  PackageCheck,
  PhoneCall,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { MobileNavigation } from './MobileNavigation';
import { TrackedSignupLink } from './TrackedSignupLink';
import styles from './garage-landing.module.css';

type IconName =
  | 'vehicle'
  | 'message'
  | 'document'
  | 'service'
  | 'calendar'
  | 'phone'
  | 'delivery'
  | 'stock'
  | 'bike'
  | 'tools'
  | 'account'
  | 'check'
  | 'yen'
  | 'card';

const vehicleStory = [
  { number: '01', icon: 'vehicle' as const, title: '在庫登録', date: '5/10 入庫', heading: 'ホワイトSUV / GL-0001', lines: ['2021年式・走行28,450km', '車台番号・仕入先・原価'], document: '車両カルテ', stamp: '入庫済' },
  { number: '02', icon: 'message' as const, title: '問い合わせ', date: '5/12 受付', heading: '佐藤様からの問い合わせ', lines: ['希望車両を同じ1台へ紐付け', '連絡先・希望条件・対応メモ'], document: '問合せメモ', stamp: '対応中' },
  { number: '03', icon: 'document' as const, title: '商談・見積', date: '5/15 商談', heading: '見積書と次回連絡', lines: ['車両・諸費用・支払条件', '担当者と次回連絡日'], document: '見積書', stamp: '提案中' },
  { number: '04', icon: 'service' as const, title: '納車・整備', date: '5/18 納車', heading: '整備内容と納車予定', lines: ['法定点検・交換部品', '作業状態・納車日・保証'], document: '整備記録', stamp: '完了' },
  { number: '05', icon: 'calendar' as const, title: '次回期限', date: '11/01 案内', heading: '点検と次回連絡', lines: ['車検満了日・点検時期', '案内期限・担当者'], document: '次回ご案内', stamp: '案内済' },
] as const;

const todayItems = [
  { icon: 'calendar' as const, title: '来店予定', detail: '本日10:30　お客様・GL-0001', note: '来店時間・目的・担当者' },
  { icon: 'phone' as const, title: '連絡期限', detail: '本日15:00まで　見積の回答待ち', note: '返信・追客が必要' },
  { icon: 'delivery' as const, title: '納車準備', detail: '明日納車　GL-0001', note: '整備・書類の確認' },
  { icon: 'calendar' as const, title: '車検期限', detail: '5/18満了　GL-0028', note: '期限が近い車両' },
  { icon: 'stock' as const, title: '長期在庫', detail: '120日経過　GL-0042', note: '在庫日数の長い車両' },
] as const;

const industryFlows = [
  { icon: 'vehicle' as const, title: '中古車販売', tone: 'used', steps: ['仕入・入庫', '在庫公開', '問い合わせ', '商談・見積', '納車', '次回案内'] },
  { icon: 'bike' as const, title: 'バイク販売', tone: 'bike', steps: ['仕入・入庫', '在庫公開', '問い合わせ', '商談・見積', '納車', '定期点検案内'] },
  { icon: 'tools' as const, title: '整備工場', tone: 'maintenance', steps: ['入庫・受付', '点検・整備', '見積・承認', '作業・納車', '次回点検案内'] },
] as const;

const startSteps = [
  { number: '01', icon: 'account' as const, title: '無料アカウントを作る', detail: '店舗名とメールアドレスを入力' },
  { number: '02', icon: 'vehicle' as const, title: '1台を登録する', detail: '在庫でも入庫中の車でも開始' },
  { number: '03', icon: 'check' as const, title: '今日の仕事を始める', detail: '次の予定を入れて確認' },
] as const;

const icons: Record<IconName, LucideIcon> = {
  vehicle: CarFront,
  message: MessageSquareText,
  document: FileText,
  service: Wrench,
  calendar: CalendarDays,
  phone: PhoneCall,
  delivery: PackageCheck,
  stock: ClipboardCheck,
  bike: Bike,
  tools: Wrench,
  account: UserRound,
  check: CheckCircle2,
  yen: BadgeJapaneseYen,
  card: CreditCard,
};

function Icon({ name }: { name: IconName }) {
  const LucideIconComponent = icons[name];
  return <LucideIconComponent aria-hidden="true" />;
}

export function GarageLandingPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GARAGE LINK',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: '中古車販売店・バイクショップ・整備工場の在庫、商談、整備、見積・請求、期限を一つにまとめる店舗管理ツール。',
    url: 'https://garage-link.tech/',
    provider: { '@type': 'Organization', name: '株式会社かんなぎ' },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY', description: 'Freeプラン' },
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label="GARAGE LINK トップページ" className={styles.brand}><BrandLogo className={styles.brandLogo} priority /></Link>
          <nav className={styles.nav} aria-label="メインナビゲーション"><a href="#features">機能</a><Link href="/pricing">料金</Link><a href="#industries">業種別</a><Link href="/faq">FAQ</Link></nav>
          <Link href="/login" className={styles.loginLink}>ログイン</Link>
          <TrackedSignupLink placement="header" className={styles.headerCta}>無料で始める</TrackedSignupLink>
          <MobileNavigation />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.heroLayout}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>車屋・バイク屋の店舗管理</p>
              <h1>1台の入庫から、<br />次の連絡まで。<br />仕事が途切れない。</h1>
              <p className={styles.heroLead}>在庫・顧客・商談・整備・期限を、<br className={styles.desktopBreak} />ひとつの店舗台帳へ。</p>
              <TrackedSignupLink placement="hero" className={styles.primaryCta}>無料で始める <ArrowRight aria-hidden="true" /></TrackedSignupLink>
              <ul className={styles.startTerms} aria-label="無料開始の条件">
                <li><span><Icon name="yen" /></span><strong>月額0円</strong></li>
                <li><span><Icon name="card" /></span><strong>カード登録不要</strong></li>
                <li><span><Icon name="vehicle" /></span><strong>在庫5台まで</strong></li>
              </ul>
            </div>
            <div className={styles.heroVisual}>
              <Image
                className={styles.heroPhoto}
                src="/branding/garage-hero-photo-wide-v1.png"
                alt="明るい店舗内に置かれた白いSUVの利用イメージ"
                width={1717}
                height={916}
                priority
                sizes="(max-width: 620px) calc(100vw - 40px), 52vw"
              />
              <div className={[styles.heroProof, styles.heroProofVehicle].join(' ')}>
                <small>車両カルテ</small><strong>ホワイトSUV</strong><span>車両ID GL-0001<br />年式・走行距離・在庫状態</span><i>入庫済</i>
              </div>
              <div className={[styles.heroProof, styles.heroProofDeal].join(' ')}>
                <small>商談・見積</small><strong>見積 #GL-250510</strong><span>支払総額 2,680,000円<br />次回連絡 05/12</span><i>提案中</i>
              </div>
              <div className={[styles.heroProof, styles.heroProofNext].join(' ')}>
                <small>次回期限</small><strong>車検満了 2026/05/18</strong><span>点検案内 2025/11/18</span><i>案内予定</i>
              </div>
              <p className={styles.heroVisualCaption}>車両写真は利用イメージです。実際の管理画面ではありません。</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.story} id="features" aria-labelledby="story-title">
        <div className={styles.container}>
          <div className={styles.centerHeading}>
            <p className={styles.sectionKicker}>ONE VEHICLE, ONE HISTORY</p>
            <h2 id="story-title">この1台の情報が、<br className={styles.mobileOnly} />納車後までつながる</h2>
            <p>同じ車両を起点にするから、担当や工程が変わっても情報を探し直しません。</p>
          </div>
          <ol className={styles.storyRail}>
            {vehicleStory.map((step) => (
              <li key={step.title} className={styles.storyStep}>
                <div className={styles.storyMarker}><span>{step.number}</span><i><Icon name={step.icon} /></i><div><strong>{step.title}</strong><small>{step.date}</small></div></div>
                <div className={styles.storyArtifact}>
                  <span className={styles.documentLabel}>{step.document}</span>
                  <strong>{step.heading}</strong>
                  {step.lines.map((line) => <small key={line}>{line}</small>)}
                  <em>{step.stamp}</em>
                </div>
              </li>
            ))}
          </ol>
          <p className={styles.storyResult}><span><Icon name="check" /></span>すべての情報が、この1台の履歴としてつながり続けます。</p>
          <p className={styles.imageDisclaimer}>掲載内容は利用場面を説明する図です。実際の管理画面ではありません。</p>
        </div>
      </section>

      <section className={styles.today} aria-labelledby="today-title">
        <div className={styles.todayGlow} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.todayHeading}>
            <div><p className={styles.sectionKicker}>TODAY&apos;S PRIORITIES</p><h2 id="today-title">朝、探す前に<br className={styles.mobileOnly} />今日の仕事が並ぶ</h2></div>
            <p><span>確認できる内容の例</span>期限、来店、納車、在庫日数を同じ優先順で確認できます。</p>
          </div>
          <ol className={styles.todayRail}>
            {todayItems.map((item, index) => (
              <li key={item.title}>
                <div className={styles.todayIcon}><span>{String(index + 1).padStart(2, '0')}</span><Icon name={item.icon} /></div>
                <strong>{item.title}</strong><p>{item.detail}</p><small>{item.note}</small>
              </li>
            ))}
          </ol>
          <p className={styles.darkDisclaimer}>実装済み機能を基にした確認内容の例です。実際の管理画面ではありません。</p>
        </div>
      </section>

      <section className={styles.industries} id="industries" aria-labelledby="industries-title">
        <div className={styles.container}>
          <div className={styles.industryHeading}><p className={styles.sectionKicker}>FOR YOUR BUSINESS</p><h2 id="industries-title">店の仕事に合わせて使える</h2><p>販売中心でも、整備中心でも。工程に合わせて同じ店舗台帳を使えます。</p></div>
          <div className={styles.industryLanes}>
            {industryFlows.map((flow) => (
              <article className={[styles.industryLane, styles[flow.tone]].join(' ')} key={flow.title}>
                <div className={styles.industryName}><span><Icon name={flow.icon} /></span><strong>{flow.title}</strong></div>
                <ol>{flow.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              </article>
            ))}
          </div>
          <div className={styles.industryLinks}><Link href="/industries/used-car">中古車販売での使い方</Link><Link href="/industries/motorcycle">バイク販売での使い方</Link><Link href="/industries/maintenance">整備工場での使い方</Link></div>
        </div>
      </section>

      <section className={styles.start} aria-labelledby="start-title">
        <div className={styles.startPattern} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.startLayout}>
            <div className={styles.startCopy}>
              <p className={styles.sectionKicker}>START FREE</p><h2 id="start-title">まず1台から、<br />無料で試す</h2><p>月額0円・カード登録不要</p>
              <TrackedSignupLink placement="final" className={styles.finalButton}>無料で始める <ArrowRight aria-hidden="true" /></TrackedSignupLink>
              <ul><li>在庫5台までずっと0円で使える</li><li>必要に応じて有料プランへ変更できる</li><li>はじめてでも、すぐに使えるシンプル設計</li></ul>
            </div>
            <div className={styles.startGuide}>
              <p>はじめ方はシンプル、3ステップ</p>
              <ol>{startSteps.map((step) => <li key={step.number}><span className={styles.startNumber}>{step.number}</span><i><Icon name={step.icon} /></i><strong>{step.title}</strong><small>{step.detail}</small></li>)}</ol>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <BrandLogo className={styles.footerLogo} />
          <nav aria-label="フッターナビゲーション"><a href="#features">機能</a><Link href="/pricing">料金</Link><a href="#industries">業種別</a><Link href="/faq">FAQ</Link><Link href="/help">ヘルプ</Link><Link href="/legal/terms">利用規約</Link><Link href="/legal/privacy">プライバシーポリシー</Link><Link href="/legal/tokusho">特定商取引法に基づく表記</Link></nav>
          <p>© 株式会社かんなぎ</p>
        </div>
      </footer>

      <TrackedSignupLink placement="mobile_sticky" className={styles.mobileStickyCta}>無料で始める</TrackedSignupLink>
    </main>
  );
}
