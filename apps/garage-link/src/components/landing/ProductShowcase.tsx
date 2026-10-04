'use client';

import Image from 'next/image';
import { useState } from 'react';
import styles from './garage-landing.module.css';

const screens = [
  {
    key: 'vehicle',
    label: '車両登録',
    src: '/product-screens/vehicle-entry.png',
    alt: 'GARAGE LINKの車両登録画面',
    title: '車両を登録',
    caption: '車両情報、仕入・販売価格、古物情報などを一つの車両台帳へ。',
  },
  {
    key: 'appointments',
    label: '予約・来店',
    src: '/product-screens/appointments.png',
    alt: 'GARAGE LINKの来店・試乗予約画面',
    title: '今日の来店を確認',
    caption: '予約日時、担当、対象車両、来店状況を同じ画面で確認します。',
  },
  {
    key: 'analytics',
    label: '分析',
    src: '/product-screens/analytics.png',
    alt: 'GARAGE LINKの分析画面',
    title: '店舗の状況を確認',
    caption: '在庫・顧客・商談など、次に確認すべき情報を店舗単位で把握します。',
  },
] as const;

export function ProductShowcase() {
  const [activeKey, setActiveKey] = useState<(typeof screens)[number]['key']>('vehicle');
  const active = screens.find((screen) => screen.key === activeKey) ?? screens[0];

  function moveTab(currentIndex: number, direction: 'next' | 'prev' | 'first' | 'last') {
    const nextIndex =
      direction === 'first' ? 0 :
      direction === 'last' ? screens.length - 1 :
      direction === 'next' ? (currentIndex + 1) % screens.length :
      (currentIndex - 1 + screens.length) % screens.length;
    const next = screens[nextIndex];
    setActiveKey(next.key);
    requestAnimationFrame(() => document.getElementById(`garage-product-tab-${next.key}`)?.focus());
  }

  return (
    <div className={styles.productShowcase}>
      <div className={styles.browserBar} aria-hidden="true">
        <span /><span /><span />
        <div>garage-link.tech</div>
      </div>
      <div className={styles.productTabs} role="tablist" aria-label="GARAGE LINK 実画面">
        {screens.map((screen) => (
          <button
            key={screen.key}
            type="button"
            id={`garage-product-tab-${screen.key}`}
            role="tab"
            aria-selected={active.key === screen.key}
            aria-controls="garage-product-panel"
            tabIndex={active.key === screen.key ? 0 : -1}
            className={active.key === screen.key ? styles.productTabActive : styles.productTab}
            onClick={() => setActiveKey(screen.key)}
            onKeyDown={(event) => {
              const index = screens.findIndex((item) => item.key === screen.key);
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveTab(index, 'next');
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveTab(index, 'prev');
              } else if (event.key === 'Home') {
                event.preventDefault();
                moveTab(index, 'first');
              } else if (event.key === 'End') {
                event.preventDefault();
                moveTab(index, 'last');
              }
            }}
          >
            {screen.label}
          </button>
        ))}
      </div>
      <div
        id="garage-product-panel"
        className={styles.productScreen}
        role="tabpanel"
        aria-labelledby={`garage-product-tab-${active.key}`}
      >
        <Image
          key={active.src}
          src={active.src}
          alt={active.alt}
          width={1015}
          height={650}
          priority={active.key === 'vehicle'}
          sizes="(max-width: 960px) 100vw, 54vw"
        />
      </div>
      <div className={styles.productCaption}>
        <strong>{active.title}</strong>
        <span>{active.caption}</span>
      </div>
    </div>
  );
}
