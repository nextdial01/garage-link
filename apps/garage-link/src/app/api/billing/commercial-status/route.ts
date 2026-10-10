import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCommercialPresentation } from '@/lib/billing/commercialPresentation';
import { admittedAddon } from '../../../../../release-candidates/issue46/addonAdmission';
import { requireAddonScope } from '../../../../../release-candidates/issue46/addonContract';

type MemberRow = { tenant_id: string; store_id: string; role: string | null };
const closed = { additionalOptions: false, standardBasic: false, dataIntegration: false };
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.id) return NextResponse.json(closed, { status: 401, headers });
    const { data: member, error: memberError } = await supabase
      .from<MemberRow>('current_user_active_store_membership')
      .select('tenant_id, store_id, role')
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .single();
    if (memberError || !member?.tenant_id || !member.store_id || !['owner', 'admin'].includes(member.role ?? '')) {
      return NextResponse.json(closed, { status: 403, headers });
    }
    const status = await getCommercialPresentation();
    const release=admittedAddon();if(!release)return NextResponse.json(closed,{headers});
    requireAddonScope(release,member.tenant_id,member.store_id);
    return NextResponse.json({...closed,additionalOptions:status.additionalOptions
    }, { headers });
  } catch {
    return NextResponse.json(closed, { status: 503, headers });
  }
}
