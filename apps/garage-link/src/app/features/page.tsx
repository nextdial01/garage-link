import { GaragePublicPage, buildGaragePublicMetadata } from '@/components/public-site/GaragePublicPage';
export const metadata = buildGaragePublicMetadata('features');
export default function FeaturesPage() { return <GaragePublicPage pageKey="features" />; }
