'use client';

import { Suspense, useRef, useState, type KeyboardEvent } from 'react';
import { GarageInteractiveDemo } from './demo/GarageInteractiveDemo';
import type { DemoView } from './demo/garageDemoData';
import styles from './garage-landing.module.css';

const steps: Array<{
  view: DemoView;
  label: string;
}> = [
  { view: 'vehicles', label: '車両' },
  { view: 'customers', label: '顧客' },
  { view: 'deals', label: '商談' },
  { view: 'quote', label: '見積' },
  { view: 'maintenance', label: '整備' },
];

export function GarageScrollStory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = steps[activeIndex];

  function focusTab(index: number) {
    const nextIndex = (index + steps.length) % steps.length;
    setActiveIndex(nextIndex);
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
        <div className={styles.storyIntro}>
          <h2 id="product-story-title">車両から整備まで、店の仕事をひと続きに。</h2>
          <p>一つの製品画面を切り替えて、車両・顧客・商談・見積・整備のつながりを確かめられます。</p>
        </div>

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
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {step.label}
            </button>
          ))}
        </div>

        <div
          className={styles.storyStage}
          id="garage-story-panel"
          role="tabpanel"
          aria-labelledby={`garage-story-tab-${active.view}`}
          tabIndex={0}
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
      </div>
    </section>
  );
}
