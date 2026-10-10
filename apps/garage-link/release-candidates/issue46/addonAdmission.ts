import 'server-only';
import {createAdminClient} from '../../src/lib/supabase/admin';
import {requireAddonAdmission,type AddonRelease} from './addonContract';
export function admittedAddon():AddonRelease|null{
 if(process.env.GARAGE_ADDON_ENABLED!=='true')return null;
 if(process.env.VERCEL_ENV!=='production'||!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')||process.env.GARAGE_STRIPE_MOCK_MODE?.trim().toLowerCase()==='true'||process.env.GARAGE_STRIPE_TEST_MODE_REQUIRED?.trim().toLowerCase()==='true')throw Error('addon_runtime_not_admitted');
 let database:URL;try{database=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'');}catch{throw Error('addon_database_invalid');}
 if(database.protocol!=='https:'||database.hostname!=='wmlpuzuskfiwdipluglz.supabase.co'||database.username||database.password)throw Error('addon_database_invalid');
 let value:AddonRelease;try{value=JSON.parse(process.env.GARAGE_ADDON_RELEASE_JSON??'');}catch{throw Error('addon_config_missing');}
 requireAddonAdmission(value);if(value.deploymentSha!==process.env.VERCEL_GIT_COMMIT_SHA||process.env.GARAGE_ADDON_PUBLIC_SHA!==value.approvedSha)throw Error('addon_deployment_identity_invalid');return value;
}

// The single readiness gate used by purchase, status, MFA and public presentation.
export async function admittedReadyAddon():Promise<AddonRelease|null>{
 const release=admittedAddon();if(!release)return null;
 const admin=createAdminClient();if(!admin)return null;
 const result=await admin.rpc('garage_addon_release_ready');
 return !result.error&&result.data===true?release:null;
}
