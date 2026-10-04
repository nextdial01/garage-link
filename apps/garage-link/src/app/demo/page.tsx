import type { Metadata } from 'next';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import { GarageInteractiveDemo } from '@/components/landing/demo/GarageInteractiveDemo';
import { TrackedInquiryLink, TrackedSignupLink } from '@/components/landing/TrackedSignupLink';

export const metadata: Metadata = {
  title: 'GARAGE LINK ライブデモ｜登録前にその場で操作',
  description: 'GARAGE LINKを登録前にその場で操作できます。業態や見たい業務を選ぶと、デモデータを作り直して車両・顧客・商談・整備・見積を確認できます。',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'GARAGE LINK ライブデモ',
    description: '登録前にデモデータを作り、その場でGARAGE LINKを操作できます。',
    url: '/demo',
  },
};

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] text-[#111318]">
      <AcquisitionPageTracker source="demo" placement="standalone_demo" />

      <header className="border-b border-[#e7e9ed] bg-white">
        <div className="mx-auto flex min-h-16 w-[min(1320px,calc(100%-32px))] items-center gap-4">
          <Link href="/" aria-label="GARAGE LINK トップ">
            <BrandLogo className="h-10 w-36 object-contain" priority />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <TrackedInquiryLink placement="demo_header_inquiry" source="demo" className="hidden min-h-9 items-center rounded-lg px-3 text-xs font-medium text-slate-600 sm:inline-flex">
              お問い合わせ
            </TrackedInquiryLink>
            <TrackedSignupLink placement="demo_header" source="demo" className="inline-flex min-h-9 items-center rounded-lg bg-[#111318] px-3 text-xs font-semibold text-white">
              無料で始める
            </TrackedSignupLink>
          </div>
        </div>
      </header>

      <section className="border-b border-[#e7e9ed] bg-white px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-[11px] font-semibold tracking-[.14em] text-slate-400">LIVE PRODUCT DEMO</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-.045em] text-[#111318] sm:text-6xl">登録する前に、触って決める。</h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
            業態・今の管理方法・見たい業務を選ぶと、その場でデモデータを作り直します。
            車両追加、商談作成、見積確認までブラウザ内だけで操作できます。
          </p>
        </div>
      </section>

      <section className="px-3 py-8 sm:px-5 sm:py-12">
        <GarageInteractiveDemo standalone />
      </section>
    </main>
  );
}
