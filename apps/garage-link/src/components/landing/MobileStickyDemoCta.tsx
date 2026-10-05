'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './garage-landing.module.css';

export function MobileStickyDemoCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ids = ['garage-hero', 'product-story', 'live-demo', 'final-cta'];
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (targets.length === 0) return;

    const visibility = new Map<Element, boolean>();
    const recompute = () => {
      const anyProtectedSectionVisible = targets.some((target) => visibility.get(target));
      setVisible(!anyProtectedSectionVisible);
    };

    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      visibility.set(target, rect.bottom > 0 && rect.top < window.innerHeight);
    }
    recompute();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visibility.set(entry.target, entry.isIntersecting);
        recompute();
      },
      { threshold: 0.04 },
    );

    targets.forEach((target) => observer.observe(target));
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
