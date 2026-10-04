import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { DemoViewTracker } from '@/components/analytics/DemoViewTracker';
import { TrackedInquiryLink, TrackedSignupLink } from '@/components/landing/TrackedSignupLink';

export const metadata: Metadata = {
  title: 'GARAGE LINK 実画面デモ｜登録前に管理画面を確認',
  description: 'GARAGE LINKの実際の管理画面を登録前に確認できます。来店・試乗予約、車両登録、在庫・顧客・商談の分析画面を掲載しています。',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'GARAGE LINK 実画面デモ',
    description: '登録前に実際の管理画面を確認できます。',
    url: '/demo',
  },
};

const screens = [
  {
    src: '/product-screens/appointments.png',
    title: '来店・試乗予約',
    description: '予約日時、担当者、対象車両、来店状況を同じ画面で確認します。',
  },
  {
    src: '/product-screens/vehicle-entry.png',
    title: '車両登録',
    description: '車両情報、仕入・販売価格、古物情報など、店舗で使う車両情報を登録します。',
  },
  {
    src: '/product-screens/analytics.png',
    title: '店舗の状況確認',
    description: '在庫・顧客・商談など、登録した情報から確認が必要な項目をまとめて見ます。',
  },
] as const;

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <DemoViewTracker />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-20 w-[min(1180px,calc(100%-32px))] items-center gap-5">
          <Link href="/" aria-label="GARAGE LINK トップ">
            <BrandLogo className="h-14 w-44 object-contain" priority />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <TrackedInquiryLink placement="demo_header_inquiry" source="demo" className="hidden rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 sm:inline-flex">
              お問い合わせ
            </TrackedInquiryLink>
            <TrackedSignupLink placement="demo_header" source="demo" className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">
              無料で始める
            </TrackedSignupLink>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-black tracking-[0.18em] text-emerald-700">REAL PRODUCT SCREENS</p>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">登録する前に、実際の画面を確認。</h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            説明用のイメージではなく、GARAGE LINKで実際に使う管理画面です。まず画面と操作イメージを確認してから、Freeプランを始められます。
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <TrackedSignupLink placement="demo_hero" source="demo" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 text-sm font-black text-white">
              月額0円で使ってみる
            </TrackedSignupLink>
            <TrackedInquiryLink placement="demo_hero_inquiry" source="demo" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-black text-slate-700">
              導入前に問い合わせる
            </TrackedInquiryLink>
          </div>
          <p className="mt-3 text-xs text-slate-500">Free：在庫5台・スタッフ1人・1店舗。カード登録不要。</p>
        </div>
      </section>

      <section className="px-4 py-12 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-10">
          {screens.map((screen, index) => (
            <article key={screen.src} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4 sm:px-7">
                <p className="text-xs font-black tracking-[0.14em] text-emerald-700">SCREEN {String(index + 1).padStart(2, '0')}</p>
                <h2 className="mt-1 text-xl font-black sm:text-2xl">{screen.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{screen.description}</p>
              </div>
              <a href={screen.src} target="_blank" rel="noreferrer" className="block bg-slate-100 p-2 sm:p-4" aria-label={screen.title + 'を拡大表示'}>
                <Image src={screen.src} alt={'GARAGE LINKの' + screen.title + '画面'} width={1015} height={650} className="h-auto w-full rounded-lg border border-slate-200" unoptimized />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-950 px-4 py-14 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold text-emerald-300">画面が店舗業務に合いそうなら、まず1台だけ。</p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">在庫5台まで、月額0円で実際に使えます。</h2>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <TrackedSignupLink placement="demo_final" source="demo" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-500 px-6 text-sm font-black text-slate-950">
              無料で始める
            </TrackedSignupLink>
            <Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-black text-white">
              料金を見る
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
