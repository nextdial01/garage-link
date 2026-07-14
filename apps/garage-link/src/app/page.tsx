import type { Metadata } from 'next';
import { LoginTopPage } from '@/components/login-top/LoginTopPage';

export const metadata: Metadata = {
  title: 'GARAGE LINK | 在庫・商談・整備管理',
  description:
    '中古車販売店・バイクショップ・整備工場の在庫、商談、見積、請求、整備を一つにつなぐGARAGE LINK。',
};

export default function Home() {
  return <LoginTopPage />;
}
