import { GaragePublicPage, buildGaragePublicMetadata } from '@/components/public-site/GaragePublicPage';
export const metadata = buildGaragePublicMetadata('faq');
export default function FaqPage() { return <GaragePublicPage pageKey="faq" />; }
