import 'server-only';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {createClient} from '../../src/lib/supabase/server';
import {admittedAddon} from './addonAdmission';
import {requireAddonScope} from './addonContract';
import {executeCommercialOptionCandidate} from './optionPurchase';
import {createCommercialOptionPorts} from './optionRuntimeBinding';
import {assertServiceTenantStoreContext} from '../../src/lib/security/garageTenantContext';
export async function wiredOption(request:Request,member:{tenant_id:string;store_id:string;role:string|null},userId:string){
 const release=admittedAddon();if(!release)return null;
 const client=await createClient();const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
 if(assurance.error||assurance.data?.currentLevel!=='aal2'||!['owner','admin'].includes(member.role??''))throw Error('commercial_actor_forbidden');
 const admin=createAdminClient();if(!admin)throw Error('commercial_admin_missing');
 requireAddonScope(release,member.tenant_id,member.store_id);
 const context={storeId:member.store_id,tenantId:member.tenant_id,actorUserId:userId,actorRole:member.role as 'owner'|'admin',source:'api' as const,correlationId:crypto.randomUUID()};
 await assertServiceTenantStoreContext(admin,context);
 return executeCommercialOptionCandidate(release,{userId,tenantId:context.tenantId,storeId:member.store_id,role:member.role??'',aal:assurance.data.currentLevel},request.headers.get('idempotency-key')??'',await request.json(),createCommercialOptionPorts());
}
