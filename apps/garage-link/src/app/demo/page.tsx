import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import { GarageInteractiveDemo } from '@/components/landing/demo/GarageInteractiveDemo';
import { PublicSiteFrame, PublicActions } from '@/components/public-site/PublicSiteChrome';
import styles from '@/components/public-site/public-cv.module.css';

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
    <PublicSiteFrame source="demo"><main>
      <AcquisitionPageTracker source="demo" placement="standalone_demo" />
      <section className={styles.content}><div className={styles.intro} style={{marginBottom:0}}><h1>登録前に、触って確かめる。</h1><p>車両の追加から商談・見積まで。デモのデータは保存されません。</p></div></section>
      <section className={styles.demoStage}>
        <Suspense fallback={<div className="mx-auto min-h-[620px] max-w-[1500px] rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">デモを準備しています...</div>}>
          <GarageInteractiveDemo standalone />
        </Suspense>
      </section>
      <section className={styles.content}><h2>自分の店舗で使うなら。</h2><PublicActions source="demo" placement="demo_final" /><p className={styles.note}>Free 0円・カード登録不要。</p></section>
    </main></PublicSiteFrame>
  );
}
