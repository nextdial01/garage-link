import { GaragePublicPage, buildGaragePublicMetadata } from '@/components/public-site/GaragePublicPage';
export const metadata = buildGaragePublicMetadata('pricing');
export default function PricingPage() { return <GaragePublicPage pageKey="pricing" />; }
