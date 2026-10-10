import {admittedReadyAddon} from '../../../../release-candidates/issue46/addonAdmission';
import CommercialTotpSetup from '../../../../release-candidates/issue46/CommercialTotpSetup';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

export default async function RetiredSecurityPage() {
  // Build-time prerendering must not evaluate the production-only release gate.
  await connection();
  try {
    if (await admittedReadyAddon()) return <CommercialTotpSetup />;
  } catch {
    // Keep MFA entry unavailable when the runtime release contract is invalid.
  }
  redirect('/dashboard');
}
