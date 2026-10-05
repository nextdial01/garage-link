import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PublicSiteFrame } from '@/components/public-site/PublicSiteChrome';
export const metadata: Metadata = { title:'無料で始める', alternates:{canonical:'/signup'}, robots:{index:false,follow:false} };
export default function Layout({children}:{children:ReactNode}) { return <PublicSiteFrame source="signup" form>{children}</PublicSiteFrame>; }
