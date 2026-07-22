import { GaragePublicPage, buildGaragePublicMetadata } from '@/components/public-site/GaragePublicPage';
export const metadata = buildGaragePublicMetadata('industries/maintenance');
export default function MaintenancePage() { return <GaragePublicPage pageKey="industries/maintenance" />; }
