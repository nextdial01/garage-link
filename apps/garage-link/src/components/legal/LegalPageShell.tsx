import Link from 'next/link';
import type { ReactNode } from 'react';
import { PublicActions, PublicSiteFrame } from '@/components/public-site/PublicSiteChrome';
import styles from '@/components/public-site/public-cv.module.css';

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
    <PublicSiteFrame source="legal"><main className={`${styles.content} ${styles.narrow}`}><div className={styles.intro}>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-sm leading-7 text-slate-600">{intro}</p>

      </div>
      <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="font-medium text-slate-700 hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>

      {children}

      <PublicActions source="legal" />
    </main></PublicSiteFrame>
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
