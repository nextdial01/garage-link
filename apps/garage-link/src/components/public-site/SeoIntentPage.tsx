import Image from 'next/image';
import Link from 'next/link';
import { TrackedInquiryLink, TrackedSignupLink } from '@/components/landing/TrackedSignupLink';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';

export type SeoIntentPageProps = {
  source: string;
  eyebrow: string;
  title: string;
  lead: string;
  screen: { src: string; alt: string; caption: string };
  problems: Array<{ title: string; body: string }>;
  capabilities: Array<{ title: string; body: string }>;
  fit: string[];
  notFit: string[];
  relatedHref: string;
  relatedLabel: string;
  faq: Array<{ q: string; a: string }>;
};

export function SeoIntentPage({
  source,
  eyebrow,
  title,
  lead,
  screen,
  problems,
  capabilities,
  fit,
  notFit,
  relatedHref,
  relatedLabel,
  faq,
}: SeoIntentPageProps) {
  return (
    <main className="min-h-screen bg-white text-slate-950">\n      <AcquisitionPageTracker source={source} placement="seo_intent" />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 w-[min(1120px,calc(100%-32px))] items-center gap-4">
          <Link href="/" className="text-lg font-black tracking-tight text-slate-900">GARAGE LINK</Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm font-bold text-slate-600 md:flex">
            <Link href="/features">機能</Link>
            <Link href="/demo">実画面</Link>
            <Link href="/pricing">料金</Link>
            <TrackedInquiryLink source={source} placement="seo_header_inquiry">お問い合わせ</TrackedInquiryLink>
          </nav>
          <TrackedSignupLink source={source} placement="seo_header" className="ml-auto rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white md:ml-0">
            無料で始める
          </TrackedSignupLink>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.95fr]">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-emerald-700">{eyebrow}</p>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">{lead}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <TrackedSignupLink source={source} placement="seo_hero" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 text-sm font-black text-white">
                月額0円で試す
              </TrackedSignupLink>
              <Link href="/demo" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-black text-slate-700">
                登録前に実画面を見る
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">Free：在庫5台・スタッフ1人・1店舗。登録時にカード情報は不要です。</p>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Image src={screen.src} alt={screen.alt} width={1015} height={650} className="h-auto w-full rounded-xl border border-slate-200" unoptimized priority />
            <figcaption className="px-2 pb-1 pt-3 text-xs leading-5 text-slate-500">{screen.caption}</figcaption>
          </figure>
        </div>
      </section>

      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-black tracking-[0.16em] text-emerald-700">CURRENT WORKFLOW</p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">システムを探す前に、分かれている情報を確認。</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {problems.map((item) => (
              <article key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-base font-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-950 px-4 py-14 text-white sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-black tracking-[0.16em] text-emerald-300">GARAGE LINK</p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">車両を軸に、日常業務をつなぐ。</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {capabilities.map((item) => (
              <article key={item.title} className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
                <h3 className="text-base font-black text-emerald-300">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-300">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-xl font-black text-emerald-950">向いている店舗</h2>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-emerald-950">
              {fit.map((item) => <li key={item}>✓ {item}</li>)}
            </ul>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-xl font-black text-amber-950">他の専用システムも比較した方がよいケース</h2>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-amber-950">
              {notFit.map((item) => <li key={item}>・{item}</li>)}
            </ul>
          </article>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-black">よくある確認事項</h2>
          <div className="mt-6 grid gap-3">
            {faq.map((item) => (
              <details key={item.q} className="rounded-xl border border-slate-200 bg-white p-5">
                <summary className="cursor-pointer text-sm font-black">{item.q}</summary>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={relatedHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-black text-slate-700">
              {relatedLabel}
            </Link>
            <TrackedInquiryLink source={source} placement="seo_faq_inquiry" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 text-sm font-black text-blue-800">
              導入前に問い合わせる
            </TrackedInquiryLink>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 text-center sm:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold text-emerald-700">最初から全データを移す必要はありません。</p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">まず1台だけ登録して、店舗業務に合うか確認。</h2>
          <TrackedSignupLink source={source} placement="seo_final" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-7 text-sm font-black text-white">
            Freeプランで試す
          </TrackedSignupLink>
        </div>
      </section>
    </main>
  );
}
