import {optionOperationRecovery} from './optionOperationRecovery';
import 'server-only';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {createClient} from '../../src/lib/supabase/server';
import {admittedReadyAddon} from './addonAdmission';
import {requireAddonScope} from './addonContract';
import {executeCommercialOptionCandidate} from './optionPurchase';
import {createCommercialOptionPorts} from './optionRuntimeBinding';
import {assertServiceTenantStoreContext} from '../../src/lib/security/garageTenantContext';
type Member={tenant_id:string;store_id:string;role:string|null};
async function optionActor(member:Member,userId:string){
 const client=await createClient();const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
 if(assurance.error||assurance.data?.currentLevel!=='aal2'||!['owner','admin'].includes(member.role??''))throw Error('commercial_actor_forbidden');
 const admin=createAdminClient();if(!admin)throw Error('commercial_admin_missing');
 const context={storeId:member.store_id,tenantId:member.tenant_id,actorUserId:userId,actorRole:member.role as 'owner'|'admin',source:'api' as const,correlationId:crypto.randomUUID()};
 await assertServiceTenantStoreContext(admin,context);
 return {userId,tenantId:context.tenantId,storeId:member.store_id,role:member.role??'',aal:assurance.data.currentLevel};
}
export async function wiredOption(request:Request,member:Member,userId:string){
 const release=await admittedReadyAddon();if(!release)return null;
 requireAddonScope(release,member.tenant_id,member.store_id);
 return executeCommercialOptionCandidate(release,await optionActor(member,userId),request.headers.get('idempotency-key')??'',await request.json(),createCommercialOptionPorts());
}
export async function wiredOptionStatus(request:Request,member:Member,userId:string){
 const release=await admittedReadyAddon();if(!release)return null;
 requireAddonScope(release,member.tenant_id,member.store_id);await optionActor(member,userId);
 const key=request.headers.get('idempotency-key')??'';
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(key))throw Error('idempotency_key_required');
 const ports=createCommercialOptionPorts(),operation=await ports.previous(member.tenant_id,key);
 if(operation)return {found:true,...optionOperationRecovery(operation)};
 const blocked=await ports.recoveryBlock(member.tenant_id);
 return blocked?{found:false,...optionOperationRecovery(blocked)}:{found:false};
}
