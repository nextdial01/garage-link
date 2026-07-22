import { GaragePublicPage, buildGaragePublicMetadata } from '@/components/public-site/GaragePublicPage';
export const metadata = buildGaragePublicMetadata('industries/used-car');
export default function UsedCarPage() { return <GaragePublicPage pageKey="industries/used-car" />; }
