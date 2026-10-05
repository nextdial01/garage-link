import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PublicSiteFrame } from '@/components/public-site/PublicSiteChrome';
export const metadata: Metadata = { title:'パスワード再設定', alternates:{canonical:'/forgot-password'}, robots:{index:false,follow:false} };
export default function Layout({children}:{children:ReactNode}) { return <PublicSiteFrame source="forgot-password" form>{children}</PublicSiteFrame>; }
