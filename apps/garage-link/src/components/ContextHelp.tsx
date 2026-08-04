'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Modal from '@/components/ui/Modal';

interface ContextHelpProps {
  title: string;
  description: string;
  inverted?: boolean;
}

export default function ContextHelp({ title, description, inverted = false }: ContextHelpProps) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const pathname = usePathname();
  const open = openPath === pathname;

  return (
    <>
      <button
        type="button"
        aria-label={`${title}の説明を見る`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpenPath(pathname)}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ring-1 transition focus-visible:outline-none focus-visible:ring-4 ${
          inverted
            ? 'bg-white/15 text-white ring-white/20 hover:bg-white/25 focus:ring-white/20'
            : 'bg-slate-100 text-slate-600 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 focus:ring-blue-100'
        }`}
      >
        ?
      </button>

      <Modal
        open={open}
        title={title}
        onClose={() => setOpenPath(null)}
        dialogClassName="max-w-md"
        footer={<button type="button" onClick={() => setOpenPath(null)} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">閉じる</button>}
      >
        <p className="text-sm leading-7 text-slate-600">{description}</p>
      </Modal>
    </>
  );
}
