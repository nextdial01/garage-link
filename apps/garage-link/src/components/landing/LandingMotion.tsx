'use client';

import { useEffect } from 'react';

export function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll<HTMLElement>('[data-lp-reveal]').forEach((element) => {
        element.dataset.revealed = 'true';
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.dataset.revealed = 'true';
          observer.unobserve(element);
        }
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );

    document.querySelectorAll<HTMLElement>('[data-lp-reveal]').forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
