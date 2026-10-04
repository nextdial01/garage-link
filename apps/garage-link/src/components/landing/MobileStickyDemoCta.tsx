'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './garage-landing.module.css';

export function MobileStickyDemoCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('garage-hero');
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.08 },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <Link
      href="#live-demo"
      className={[styles.mobileStickyCta, visible ? styles.mobileStickyCtaVisible : ''].filter(Boolean).join(' ')}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      デモを触る
    </Link>
  );
}
