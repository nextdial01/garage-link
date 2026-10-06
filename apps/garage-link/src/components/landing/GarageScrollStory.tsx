'use client';

import { Suspense, useRef, useState, type KeyboardEvent } from 'react';
import { trackConversion } from '@/lib/analytics/conversion';
import { GarageInteractiveDemo } from './demo/GarageInteractiveDemo';
import type { DemoView } from './demo/garageDemoData';
import styles from './garage-landing.module.css';

const steps: Array<{
  view: DemoView;
  label: string;
  caption: string;
}> = [
  { view: 'vehicles', caption: '売れる車両が、ひと目で', label: '車両' },
  { view: 'customers', caption: 'この車両を探している人へ', label: '顧客' },
  { view: 'deals', caption: '次に、誰へ連絡するか', label: '商談' },
  { view: 'quote', caption: '車両の情報から、見積へ', label: '見積' },
  { view: 'maintenance', caption: '今日の作業と、納車予定', label: '整備' },
];

export function GarageScrollStory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = steps[activeIndex];

  function selectTab(index: number) {
    setActiveIndex(index);
    trackConversion('demo_interaction', { source: 'landing', placement: 'product_story', demo_action: 'product_story_switch', demo_view: steps[index].view });
  }

  function focusTab(index: number) {
    const nextIndex = (index + steps.length) % steps.length;
    selectTab(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(steps.length - 1);
    }
  }

  return (
    <section className={styles.storySection} id="product-story" aria-labelledby="product-story-title">
      <div className={styles.storyShell}>
        <h2 id="product-story-title" className={styles.visuallyHidden}>車両を開けば、次にやることが見える。</h2>
        <div className={styles.storySteps} role="tablist" aria-label="業務画面">
          {steps.map((step, index) => (
            <button
              key={step.view}
              id={`garage-story-tab-${step.view}`}
              type="button"
              role="tab"
              ref={(node) => { tabRefs.current[index] = node; }}
              data-story-index={index}
              aria-selected={activeIndex === index}
              aria-controls="garage-story-panel"
              tabIndex={activeIndex === index ? 0 : -1}
              className={activeIndex === index ? styles.storyStepActive : styles.storyStep}
              onClick={() => selectTab(index)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {step.label}
              {index < steps.length - 1 && <span className={styles.storyArrow} aria-hidden="true">›</span>}
            </button>
          ))}
        </div>

        <div
          className={styles.storyStage}
          id="garage-story-panel"
          role="tabpanel"
          aria-labelledby={`garage-story-tab-${active.view}`}
          tabIndex={0}
          aria-describedby="garage-story-caption garage-story-hint"
          data-active-view={active.view}
          data-testid="garage-scroll-story-stage"
        >
          <Suspense fallback={<div className={styles.storyLoading}>製品画面を準備しています...</div>}>
            <GarageInteractiveDemo
              initialScenario={{ business: 'used-car', management: 'excel', goal: 'inventory' }}
              forcedView={active.view}
              hideConfigurator
              storyMode
            />
          </Suspense>
        </div>
        <p id="garage-story-caption" className={styles.storyIntro} aria-live="polite">{active.caption}</p>
        <p id="garage-story-hint" className={styles.storyHint}>画面は上のタブで切り替え。自由な操作はデモへ。</p>
      </div>
    </section>
  );
}
