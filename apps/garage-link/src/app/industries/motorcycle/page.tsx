import { GaragePublicPage, buildGaragePublicMetadata } from '@/components/public-site/GaragePublicPage';
export const metadata = buildGaragePublicMetadata('industries/motorcycle');
export default function MotorcyclePage() { return <GaragePublicPage pageKey="industries/motorcycle" />; }
