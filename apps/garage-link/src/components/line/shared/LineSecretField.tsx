'use client';

import { forwardRef } from 'react';

type LineSecretFieldProps = {
  id: string;
  label: string;
  maskedValue?: string | null;
  inputClassName: string;
};

const LineSecretField = forwardRef<HTMLInputElement, LineSecretFieldProps>(
  function LineSecretField({ id, label, maskedValue, inputClassName }, ref) {
    return (
      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-700">
          {label}
        </label>
        <div className="mb-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          現在の値: {maskedValue || '未設定'}
        </div>
        <input
          id={id}
          ref={ref}
          type="password"
          defaultValue=""
          placeholder="変更する場合のみ入力"
          className={inputClassName}
          autoComplete="new-password"
        />
      </div>
    );
  }
);

export default LineSecretField;
