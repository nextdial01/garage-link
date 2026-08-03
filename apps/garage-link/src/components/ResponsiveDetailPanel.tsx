'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';

type ResponsiveDetailPanelProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function ResponsiveDetailPanel({
  open,
  title,
  subtitle,
  onClose,
  children,
}: ResponsiveDetailPanelProps) {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (!open) {
    return null;
  }

  if (isCompact) {
    return (
      <Modal open title={title} description={subtitle} onClose={onClose} dialogClassName="max-w-2xl">
        {children}
      </Modal>
    );
  }

  return (
      <aside className="sticky top-24 w-[360px] self-start">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-base font-black text-slate-950">{title}</p>
              {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              閉じる
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </aside>
  );
}
