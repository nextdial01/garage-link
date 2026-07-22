import type { Metadata } from 'next';
import { GarageLandingPage } from '@/components/landing/GarageLandingPage';

export const metadata: Metadata = {
  title: 'GARAGE LINK | 在庫・商談・整備・期限がつながる店舗管理',
  description:
    '中古車販売店・バイクショップ・整備工場の在庫、商談、整備、見積・請求、期限を一つの店舗台帳へ。Freeプランは月額0円、カード登録なしで始められます。',
  alternates: { canonical: '/' },
};

export default function Home() {
  return <GarageLandingPage />;
}
