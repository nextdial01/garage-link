import type { Metadata } from 'next';
import { GarageLandingPage } from '@/components/landing/GarageLandingPage';

export const metadata: Metadata = {
  title: 'GARAGE LINK｜中古車販売・整備工場向け店舗管理システム',
  description:
    '中古車販売店・バイク販売修理店・整備工場向けの店舗管理システム。在庫、顧客、商談、見積・請求、整備、車検期限を一つの店舗台帳へ。Freeプランは月額0円、カード登録不要です。',
  alternates: { canonical: '/' },
};

export default function Home() {
  return <GarageLandingPage />;
}
