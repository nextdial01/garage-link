import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { GarageLoginForm } from '@/components/auth/GarageLoginForm';
import styles from './login-top.module.css';

const features = [
  { label: '今日の対応を\n優先順に確認', icon: 'clock' },
  { label: '役割に合わせて\n権限を設定', icon: 'shield' },
  { label: '在庫と商談を\n同じ数字で確認', icon: 'chart' },
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
    description:
      '中古車販売店・バイクショップ・整備工場の在庫、顧客、商談、見積、請求、整備をひとつにまとめる店舗管理ツール。',
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
            <span className={styles.headlineLine}><span className={styles.mobileLine}>在庫も、商談も、</span><span className={styles.mobileLine}>整備も。</span></span>
            <span className={styles.headlineLine}><span className={styles.mobileLine}>今日の仕事を</span><span className={styles.mobileLine}><em>一画面</em>に。</span></span>
          </h1>
          <p className={styles.lead}>
            車両、顧客、商談、整備、見積・請求を一つの店舗台帳へ。
            担当者と期限を共有し、次に動く仕事から確認できます。
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
              <strong>LINEの反応から、次の案内を判断</strong>
              <small>友だち・回答・配信履歴の管理</small>
            </span>
            <ArrowIcon />
          </a>
          <a href="https://l-touring.tech/" className={styles.serviceCard}>
            <Image src="/branding/l-touring-logo.png" alt="L-touring" width={1600} height={900} className={styles.touringLogo} />
            <span className={styles.serviceCopy}>
              <strong>LINE導線の設計と初期構築を支援</strong>
              <small>車・バイク業界向けLINE支援</small>
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
