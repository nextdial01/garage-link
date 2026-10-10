import 'server-only';
import {connection} from 'next/server';
import {admittedAddon} from '../../../release-candidates/issue46/addonAdmission';
import type {PublicReleaseStatus} from '@/components/public-site/PublicPlanSummary';
const closed:PublicReleaseStatus={additionalOptions:false,standardBasic:false,dataIntegration:false};
export async function getCommercialPresentation():Promise<PublicReleaseStatus>{
 await connection();try{const r=admittedAddon();if(!r||process.env.GARAGE_ADDON_PUBLIC_SHA!==r.approvedSha)return closed;return {...closed,additionalOptions:true};}catch{return closed;}
}
