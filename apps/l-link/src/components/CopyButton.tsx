"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      className="rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-50"
    >
      {copied ? "コピー済み" : "Webhook URLコピー"}
    </button>
  );
}
