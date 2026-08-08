'use client';

import Modal from '@/components/ui/Modal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  tone?: 'danger' | 'primary';
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
  tone = 'danger',
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onClose}
      dialogClassName="max-w-md"
      footer={(
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            キャンセル
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`rounded-xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {busy ? '処理中...' : confirmLabel}
          </button>
        </div>
      )}
    >
      <p className="text-sm leading-7 text-slate-700">{description}</p>
      <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">内容を確認し、実行する場合だけ右のボタンを押してください。</p>
    </Modal>
  );
}
