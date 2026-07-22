import type { Metadata } from 'next';
import { LoginTopPage } from '@/components/login-top/LoginTopPage';

export const metadata: Metadata = {
  title: 'ログイン',
  description: 'GARAGE LINKへログインします。',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginTopPage />;
}
