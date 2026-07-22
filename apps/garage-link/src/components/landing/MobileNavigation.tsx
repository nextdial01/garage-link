'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import styles from './garage-landing.module.css';

export function MobileNavigation() {
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
        <a href="#features" onClick={close}>機能</a>
        <Link href="/pricing" onClick={close}>料金</Link>
        <a href="#industries" onClick={close}>業種別</a>
        <Link href="/faq" onClick={close}>FAQ</Link>
        <Link href="/login" onClick={close}>ログイン</Link>
      </nav>
    </div>
  );
}
