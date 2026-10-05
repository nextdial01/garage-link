'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { GarageInteractiveDemo } from './demo/GarageInteractiveDemo';
import type { DemoView } from './demo/garageDemoData';
import styles from './garage-landing.module.css';

const steps: Array<{
  view: DemoView;
  eyebrow: string;
  title: string;
  body: string;
}> = [
  {
    view: 'vehicles',
    eyebrow: '01 / VEHICLE',
    title: '1台の車両から始める。',
    body: '仕入、在庫日数、価格、車検。まず車両の事実を一つにします。',
  },
  {
    view: 'customers',
    eyebrow: '02 / CUSTOMER',
    title: '顧客を車両から離さない。',
    body: '誰が、どの車を見ていて、次にいつ連絡するかまで同じ流れで確認します。',
  },
  {
    view: 'deals',
    eyebrow: '03 / DEAL',
    title: '商談に「次」を残す。',
    body: '見積、担当、次回連絡。止まっている商談を、担当者の記憶から外へ出します。',
  },
  {
    view: 'quote',
    eyebrow: '04 / QUOTE',
    title: '見積まで同じデータで。',
    body: '車両と顧客を選び直さず、商談から見積へつなげます。',
  },
  {
    view: 'maintenance',
    eyebrow: '05 / AFTER',
    title: '納車後も、同じ車両が続く。',
    body: '整備、部品、納車予定、次回車検まで、履歴を切らさず残します。',
  },
];

export function GarageScrollStory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!window.matchMedia('(min-width: 1041px)').matches) return;

    const nodes = stepRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = Number((visible.target as HTMLElement).dataset.storyIndex);
        if (Number.isFinite(index)) setActiveIndex(index);
      },
      { rootMargin: '-32% 0px -46% 0px', threshold: [0.12, 0.35, 0.6] },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const active = steps[activeIndex];

  return (
    <section className={styles.storySection} id="product-story" aria-labelledby="product-story-title">
      <div className={styles.storyShell}>
        <div className={styles.storyRail}>
          <div className={styles.storyIntro}>
            <p>ONE VEHICLE, ONE CONTEXT</p>
            <h2 id="product-story-title">スクロールすると、仕事の続きを追えます。</h2>
          </div>

          <div className={styles.storySteps}>
            {steps.map((step, index) => (
              <button
                key={step.view}
                type="button"
                ref={(node) => { stepRefs.current[index] = node; }}
                data-story-index={index}
                aria-current={activeIndex === index ? 'step' : undefined}
                className={activeIndex === index ? styles.storyStepActive : styles.storyStep}
                onClick={() => setActiveIndex(index)}
              >
                <span>{step.eyebrow}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.storyStage}>
          <div className={styles.storySticky} data-testid="garage-scroll-story-stage">
            <div className={styles.storyStageHeader}>
              <span>{active.eyebrow}</span>
              <strong>{active.title}</strong>
            </div>
            <Suspense fallback={<div className={styles.storyLoading}>製品画面を準備しています...</div>}>
              <GarageInteractiveDemo
                initialScenario={{ business: 'used-car', management: 'excel', goal: 'inventory' }}
                forcedView={active.view}
                hideConfigurator
                storyMode
              />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}
