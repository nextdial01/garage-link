'use client';

import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import Modal from './Modal';

type ActionDialogOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  input?: {
    label: string;
    minLength?: number;
    placeholder?: string;
  };
};

function ActionDialog({
  options,
  onResolve,
}: {
  options: ActionDialogOptions;
  onResolve: (value: string | null) => void;
}) {
  const [value, setValue] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const minimum = options.input?.minLength ?? 0;
  const confirmDisabled = Boolean(options.input) && value.trim().length < minimum;

  return (
    <Modal
      open
      title={options.title}
      description={options.description}
      onClose={() => onResolve(null)}
      initialFocusRef={cancelRef}
      footer={(
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onResolve(null)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={() => onResolve(options.input ? value.trim() : 'confirmed')}
            className={options.tone === 'danger'
              ? 'rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300'
              : 'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300'}
          >
            {options.confirmLabel}
          </button>
        </div>
      )}
    >
      {options.input && (
        <label className="block">
          <span className="text-sm font-bold text-slate-700">{options.input.label}</span>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={options.input.placeholder}
            rows={4}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-950 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          />
          {minimum > 0 && (
            <span className="mt-2 block text-xs font-semibold text-slate-600">
              {minimum}文字以上で入力してください。
            </span>
          )}
        </label>
      )}
    </Modal>
  );
}

function openActionDialog(options: ActionDialogOptions) {
  if (typeof document === 'undefined') return Promise.resolve<string | null>(null);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(<ActionDialog options={options} onResolve={finish} />);
  });
}

export async function confirmAction(options: ActionDialogOptions) {
  return (await openActionDialog(options)) !== null;
}

export function promptAction(options: ActionDialogOptions & { input: NonNullable<ActionDialogOptions['input']> }) {
  return openActionDialog(options);
}
