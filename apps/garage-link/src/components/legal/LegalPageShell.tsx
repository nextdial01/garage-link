import Link from 'next/link';
import type { ReactNode } from 'react';

type LegalPageShellProps = {
  title: string;
  intro: string;
  children: ReactNode;
};

const LEGAL_LINKS = [
  { href: '/legal/terms', label: '利用規約' },
  { href: '/legal/privacy', label: 'プライバシーポリシー' },
  { href: '/legal/tokusho', label: '特定商取引法に基づく表記' },
] as const;

export function LegalPageShell({ title, intro, children }: LegalPageShellProps) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-sm leading-7 text-slate-600">{intro}</p>

      <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="font-semibold text-blue-600 hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>

      {children}

      <footer className="mt-10 border-t pt-6 text-sm text-slate-500">
        <Link href="/" className="font-bold text-blue-600 hover:underline">
          ← トップページ
        </Link>
        <span className="mx-2">·</span>
        <Link href="/signup" className="font-bold text-blue-600 hover:underline">
          サインアップ
        </Link>
      </footer>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">{children}</div>
    </section>
  );
}
