// Normal route delegates with NO diagnostic dependencies; default behavior unchanged.
import { runInspectionJobGET, runInspectionJobPOST } from '@/lib/jobs/inspectionReminderHandlers';
export const dynamic = 'force-dynamic';
export async function GET(request:Request){return runInspectionJobGET(request);}
export async function POST(request:Request){return runInspectionJobPOST(request);}
