'use client';

import { useEffect, useId, useState } from 'react';

interface ContextHelpProps {
  title: string;
  description: string;
  inverted?: boolean;
}

export default function ContextHelp({ title, description, inverted = false }: ContextHelpProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={`${title}の説明を見る`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ring-1 transition focus:outline-none focus:ring-4 ${
          inverted
            ? 'bg-white/15 text-white ring-white/20 hover:bg-white/25 focus:ring-white/20'
            : 'bg-slate-100 text-slate-600 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 focus:ring-blue-100'
        }`}
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
          <button type="button" aria-label="説明を閉じる" className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id={titleId} className="text-base font-black text-slate-950">{title}</p>
                <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-600 hover:bg-slate-200" aria-label="閉じる">×</button>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">閉じる</button>
          </div>
        </div>
      )}
    </>
  );
}
