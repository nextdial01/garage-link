import Link from 'next/link';
import type { ReactNode } from 'react';
import BrandLogo from '@/components/BrandLogo';
import { MobileNavigation } from '@/components/landing/MobileNavigation';
import { TrackedDemoLink, TrackedInquiryLink, TrackedLoginLink, TrackedSignupLink } from '@/components/landing/TrackedSignupLink';
import landing from '@/components/landing/garage-landing.module.css';
import styles from './public-cv.module.css';

export function PublicSiteHeader({ source = 'landing' }: { source?: string }) {
  return <header className={`${landing.header} ${styles.header}`} data-public-header="garage-link">
    <div className={landing.headerInner}>
      <Link href="/" aria-label="GARAGE LINK トップページ" className={landing.brand}><BrandLogo className={landing.brandLogo} priority /></Link>
      <nav className={landing.nav} aria-label="メインナビゲーション">
        <Link href="/features">製品</Link><Link href="/pricing">料金</Link><Link href="/demo">デモ</Link><Link href="/faq">FAQ</Link>
      </nav>
      <TrackedLoginLink className={landing.loginLink}>ログイン</TrackedLoginLink>
      <TrackedSignupLink source={source} placement={source === 'demo' ? 'demo_header' : source.startsWith('seo_') ? 'seo_header' : 'header'} className={landing.headerCta}>無料で始める</TrackedSignupLink>
      <MobileNavigation source={source} />
    </div>
  </header>;
}

export function PublicSiteFooter({ source = 'landing' }: { source?: string }) {
  return <footer className={`${landing.footer} ${styles.footer}`} data-public-footer="garage-link">
    <div className={landing.footerTop}>
      <Link href="/" aria-label="GARAGE LINK トップページ"><BrandLogo className={landing.footerLogo} /></Link>
      <nav aria-label="フッターナビゲーション"><Link href="/features">製品</Link><Link href="/pricing">料金</Link><Link href="/demo">デモ</Link><Link href="/faq">FAQ</Link><Link href="/help">使い始め方</Link><TrackedInquiryLink source={source} placement="footer_inquiry">お問い合わせ</TrackedInquiryLink></nav>
    </div>
    <nav className={styles.industryLinks} aria-label="業種別の使い方"><Link href="/industries/used-car">中古車販売店</Link><Link href="/industries/motorcycle">バイク販売・修理店</Link><Link href="/industries/maintenance">整備工場</Link></nav>
    <div className={landing.footerBottom}><p>© 株式会社かんなぎ</p><nav aria-label="法務情報"><Link href="/legal/terms">利用規約</Link><Link href="/legal/privacy">プライバシーポリシー</Link><Link href="/legal/tokusho">特定商取引法に基づく表記</Link></nav></div>
  </footer>;
}

export function PublicActions({ source, placement = 'final' }: { source: string; placement?: string }) {
  return <div className={styles.actions}><TrackedSignupLink source={source} placement={placement} className={landing.primaryCta}>無料で始める <span aria-hidden="true">→</span></TrackedSignupLink><TrackedDemoLink source={source} placement={`${placement}_demo`} className={landing.secondaryCta}>触って確かめる</TrackedDemoLink></div>;
}

export function PublicSiteFrame({ children, source, form = false }: { children: ReactNode; source: string; form?: boolean }) {
  return <div className={`${landing.page} ${styles.site}`} data-public-site><PublicSiteHeader source={source} /><div className={form ? styles.formPage : undefined}>{children}</div><PublicSiteFooter source={source} /></div>;
}
