import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { GarageLoginForm } from '@/components/auth/GarageLoginForm';
import styles from './login-top.module.css';

const features = [
  { label: '導入・運用が\nカンタン', icon: 'clock' },
  { label: '安心・安全の\nセキュリティ', icon: 'shield' },
  { label: '売上につながる\n仕組みを提供', icon: 'chart' },
];

function FeatureIcon({ name }: { name: string }) {
  if (name === 'shield') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 4 26 8v7c0 6-3.8 10.4-10 13-6.2-2.6-10-7-10-13V8l10-4Z" />
        <path d="m11.5 16 3 3 6.5-7" />
      </svg>
    );
  }

  if (name === 'chart') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 25V18M13 25V14M19 25V10M25 25V6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" />
      <path d="M16 9v7l5 3" />
      <path d="m7 7-2 5 5-1" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <span className={styles.arrow} aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>
    </span>
  );
}

export function LoginTopPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GARAGE LINK',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: '中古車・バイク販売店、整備工場の店舗業務を一元管理するサービス。',
    url: 'https://garage-link.tech/',
    provider: { '@type': 'Organization', name: '株式会社かんなぎ' },
  };

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <div className={styles.arc} aria-hidden="true" />
      <div className={styles.beam} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/" aria-label="GARAGE LINK トップページ">
          <BrandLogo className={styles.brandLogo} priority />
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>AUTOMOTIVE BUSINESS PLATFORM</p>
          <h1>
            <span className={styles.headlineLine}>つなぐ力で、</span>
            <span className={styles.headlineLine}>ビジネスを<em>加速</em>する。</span>
          </h1>
          <p className={styles.lead}>
            かんなぎのプラットフォームが、店舗業務をシンプルに。
            中古車販売店・バイクショップ・整備工場の成長を支えます。
          </p>
          <div className={styles.features}>
            {features.map((feature) => (
              <div className={styles.feature} key={feature.label}>
                <span className={styles.featureIcon}><FeatureIcon name={feature.icon} /></span>
                <span>{feature.label.split('\n').map((line) => <span key={line}>{line}</span>)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.loginPanel}>
          <Suspense fallback={<div className={styles.loginFallback}>ログイン画面を読み込んでいます...</div>}>
            <GarageLoginForm embedded />
          </Suspense>
        </div>
      </section>

      <section className={styles.services} aria-labelledby="kannagi-services-title">
        <div className={styles.sectionHeading}>
          <p>KANNAGI SERVICES</p>
          <h2 id="kannagi-services-title">かんなぎのサービス</h2>
        </div>
        <div className={styles.serviceGrid}>
          <a href="https://llink.tech/" className={styles.serviceCard}>
            <Image src="/branding/l-link-logo.png" alt="L-LINK" width={2172} height={724} className={styles.llinkLogo} />
            <span className={styles.serviceCopy}>
              <strong>LINEから、来店につながる導線へ</strong>
              <small>LINE導線整理・友だち管理</small>
            </span>
            <ArrowIcon />
          </a>
          <a href="https://l-touring.tech/" className={styles.serviceCard}>
            <Image src="/branding/l-touring-logo.png" alt="L-touring" width={1600} height={900} className={styles.touringLogo} />
            <span className={styles.serviceCopy}>
              <strong>LINEから売上につながる導線へ</strong>
              <small>LINE売上導線構築支援</small>
            </span>
            <ArrowIcon />
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© 株式会社かんなぎ</span>
        <nav aria-label="フッターナビゲーション">
          <Link href="/help">ヘルプ</Link>
          <Link href="/legal/terms">利用規約</Link>
          <Link href="/legal/privacy">プライバシーポリシー</Link>
          <Link href="/legal/tokusho">特定商取引法に基づく表記</Link>
        </nav>
      </footer>
    </main>
  );
}
