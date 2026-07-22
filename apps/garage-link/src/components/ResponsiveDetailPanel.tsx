'use client';

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
  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] rounded-t-3xl border border-slate-200 bg-white shadow-2xl lg:hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-base font-black text-slate-950">{title}</p>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            閉じる
          </button>
        </div>
        <div className="max-h-[calc(85vh-72px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>

      <aside className="hidden lg:sticky lg:top-24 lg:block lg:w-[360px] lg:self-start">
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
    </>
  );
}
