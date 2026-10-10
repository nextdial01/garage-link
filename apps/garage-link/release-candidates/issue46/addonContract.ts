// Addon-only authorization: GL membership and paid subscription remain authoritative.
export type AddonRelease = {enabled:boolean;deploymentSha:string;approvedSha:string;environment:'production';stripeMode:'live';schemaVerified:boolean;rollbackVerified:boolean;databaseRef:'wmlpuzuskfiwdipluglz';scopePolicy:'authenticated_active_paid_store'};
export function requireAddonAdmission(r:AddonRelease){
 if(!r?.enabled||!r.schemaVerified||!r.rollbackVerified||r.environment!=='production'||r.stripeMode!=='live'||r.databaseRef!=='wmlpuzuskfiwdipluglz'||r.scopePolicy!=='authenticated_active_paid_store'||! /^[a-f0-9]{40}$/.test(r.approvedSha)||r.deploymentSha!==r.approvedSha)throw Error('addon_release_not_admitted');
}
export function requireAddonScope(r:AddonRelease,tenantId:string,storeId:string){
 requireAddonAdmission(r);const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!uuid.test(tenantId)||!uuid.test(storeId))throw Error('addon_scope_invalid');
}
