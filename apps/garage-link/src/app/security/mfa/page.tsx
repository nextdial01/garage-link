import {admittedAddon} from '../../../../release-candidates/issue46/addonAdmission';
import CommercialTotpSetup from '../../../../release-candidates/issue46/CommercialTotpSetup';
import { redirect } from 'next/navigation';

export default function RetiredSecurityPage() {
  if(admittedAddon())return <CommercialTotpSetup/>;
  redirect('/dashboard');
}
