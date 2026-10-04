'use client';

import Link from 'next/link';
import { useHydrated } from '@/lib/browser/useHydrated';
import { TrackedInquiryLink, TrackedLoginLink } from './TrackedSignupLink';
import { Menu, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import styles from './garage-landing.module.css';

export function MobileNavigation() {
  const isHydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const navigationId = useId();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const close = () => setOpen(false);

  return (
    <div className={styles.mobileMenuRoot}>
      <button
        type="button"
        data-testid="mobile-menu-trigger"
        disabled={!isHydrated}
        className={styles.mobileMenuButton}
        aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
        aria-expanded={open}
        aria-controls={navigationId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>

      <button
        type="button"
        className={`${styles.mobileMenuBackdrop} ${open ? styles.mobileMenuBackdropOpen : ''}`}
        aria-label="メニューを閉じる"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={close}
      />

      <nav
        id={navigationId}
        className={`${styles.mobileMenuPanel} ${open ? styles.mobileMenuPanelOpen : ''}`}
        aria-label="スマホメニュー"
        aria-hidden={!open}
      >
        <Link href="/demo" onClick={close}>実画面</Link>
        <a href="#product" onClick={close}>使い方</a>
        <a href="#industries" onClick={close}>業種別</a>
        <Link href="/pricing" onClick={close}>料金</Link>
        <Link href="/faq" onClick={close}>FAQ</Link>
        <TrackedInquiryLink placement="mobile_menu_inquiry" onClick={close}>お問い合わせ</TrackedInquiryLink>
        <TrackedLoginLink onClick={close}>ログイン</TrackedLoginLink>
      </nav>
    </div>
  );
}
