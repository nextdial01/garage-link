import { getGarageMobileBearerContext } from '@/lib/mobile/bearerAuth';
import { createBearerClient } from '@/lib/supabase/admin';
import { v2Patch, uuid, V2_RESOURCES } from '@/lib/mobile/v2Resources';
import { maintenanceBusinessPatch, maintenancePartLines, validateMobileCustomer } from '@/lib/mobile/businessPatch';
export async function POST(request: Request) {
 const context = await getGarageMobileBearerContext(request);
 if (!context.ok) return context.response;
 const fail = (status:number,error:string) => Response.json({ok:false,error},{status});
 if (context.member.role === 'viewer') return fail(403,'登録権限がありません。');
 const body = await request.json().catch(()=>null);
 if (!body || !uuid(body.id) || !body.job || typeof body.job !== 'object') return fail(400,'入力内容を確認してください。');
 const job = v2Patch('maintenance',body.job);
 if (!job) return fail(400,'整備内容を確認してください。');
 try { if (body.customer) validateMobileCustomer(body.customer); } catch { return fail(400,'顧客名と生年月日を入力してください。'); }
 if ((!body.customer && !job.customer_id) || (!body.vehicle && !job.vehicle_id)) return fail(400,'顧客と車両を選択してください。');
 if (body.jobId != null && !uuid(body.jobId)) return fail(400,'案件IDを確認してください。');
 const existing = body.jobId ? await context.service.from('maintenance_jobs').select(V2_RESOURCES.maintenance.fields).eq('id',body.jobId).eq('store_id',context.member.storeId).is('deleted_at',null).maybeSingle() : null;
 if (body.jobId && (!existing?.data || existing.error)) return fail(404,'案件が見つかりません。');
 const jobNo = existing?.data?.job_no || `M-${body.id}`;
 const previous = await context.service.from('maintenance_jobs').select(V2_RESOURCES.maintenance.fields).eq('job_no',jobNo).eq('store_id',context.member.storeId).maybeSingle();
 if (previous.error) return fail(500,'登録状態を確認できませんでした。');
 if (previous.data && !body.jobId) return Response.json({ok:true,row:previous.data,replayed:true});
 const store = await context.service.from('stores').select('tax_display_mode').eq('id',context.member.storeId).single();
 if (!store.data) return fail(500,'店舗設定を取得できませんでした。');
 if (existing?.data && job.tax_display_mode && job.tax_display_mode !== (existing.data.tax_display_mode || 'included')) return fail(400,'帳票の税表示方式は変更できません。');
 const token = request.headers.get('authorization')!.replace(/^Bearer\s+/i,'');
 const client = createBearerClient(token);
 if (!client) return fail(500,'接続設定を確認できませんでした。');
 const parts = body.jobId ? await client.from('maintenance_job_parts').select('subtotal_amount,tax_rate').eq('job_id',body.jobId).eq('store_id',context.member.storeId) : { data: [], error: null };
 if (parts.error) return fail(500,'使用部品を確認できませんでした。');
 try { Object.assign(job,maintenanceBusinessPatch({...existing?.data,...job},existing?.data ? existing.data.tax_display_mode || 'included' : store.data.tax_display_mode,Object.hasOwn(job,'work_details'),maintenancePartLines(parts.data ?? []))); } catch { return fail(400,'作業明細・金額を確認してください。'); }
 const result = await client.rpc('save_maintenance_with_links',{p_store_id:context.member.storeId,p_job_id:body.jobId || null,p_job:{...job,job_no:jobNo},p_customer:body.customer || null,p_vehicle:body.vehicle || null});
 if (result.error) return fail(400,'登録できませんでした。顧客・車両・作業の入力を確認してください。');
 const saved = await context.service.from('maintenance_jobs').select(V2_RESOURCES.maintenance.fields).eq('id',result.data.job_id).eq('store_id',context.member.storeId).single();
 if (!saved.data) return fail(500,'登録後の確認に失敗しました。再度保存して状態を確認してください。');
 return Response.json({ok:true,row:saved.data},{status:201});
}
