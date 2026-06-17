import type { ReactNode } from 'react';

export function UiCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function UiBadge({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'green' | 'slate' }) {
  const toneClass = tone === 'green' ? 'bg-green-50 text-green-700' : tone === 'slate' ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-700';

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${toneClass}`}>{children}</span>;
}
