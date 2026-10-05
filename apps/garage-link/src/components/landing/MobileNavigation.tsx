'use client';

import Link from 'next/link';
import { useHydrated } from '@/lib/browser/useHydrated';
import { TrackedLoginLink, TrackedSignupLink } from './TrackedSignupLink';
import { Menu, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import styles from './garage-landing.module.css';

export function MobileNavigation({ source = 'landing' }: { source?: string }) {
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
        <Link href="/features" onClick={close}>製品</Link>
        <Link href="/pricing" onClick={close}>料金</Link>
        <Link href="/demo" onClick={close}>デモ</Link>
        <Link href="/faq" onClick={close}>FAQ</Link>
        <TrackedLoginLink onClick={close}>ログイン</TrackedLoginLink>
        <TrackedSignupLink source={source} placement="mobile_menu">無料で始める</TrackedSignupLink>
      </nav>
    </div>
  );
}
