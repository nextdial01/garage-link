"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {pending ? "保存中..." : label}
    </button>
  );
}
