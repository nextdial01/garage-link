import {admittedReadyAddon} from '../../../../release-candidates/issue46/addonAdmission';
import CommercialTotpSetup from '../../../../release-candidates/issue46/CommercialTotpSetup';
import { redirect } from 'next/navigation';

export default async function RetiredSecurityPage() {
  if(await admittedReadyAddon())return <CommercialTotpSetup/>;
  redirect('/dashboard');
}
