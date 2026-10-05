import { Suspense } from 'react';
import { GarageLoginForm } from '@/components/auth/GarageLoginForm';
import { PublicSiteFrame } from '@/components/public-site/PublicSiteChrome';
export function LoginTopPage() {
  return <PublicSiteFrame source="login" form><main className="flex justify-center"><div className="w-full max-w-md"><Suspense fallback={<p>ログイン画面を読み込んでいます...</p>}><GarageLoginForm embedded /></Suspense></div></main></PublicSiteFrame>;
}
