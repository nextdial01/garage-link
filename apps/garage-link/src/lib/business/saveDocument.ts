import { createClient } from '@/lib/supabase/client';

const serverFields = new Set(['id','store_id','created_at','updated_at','issued_at','issued_by','pdf_generated_at','cancelled_at','cancel_reason','paid_amount','unpaid_amount']);
/** Header and ordered rows commit together. A rejected row leaves no partial document. */
export async function saveDocument(kind: 'quote' | 'invoice', storeId: string, header: Record<string, unknown>, items: Record<string, unknown>[], documentId: string | null = null) {
  const payload = Object.fromEntries(Object.entries(header).filter(([key]) => !serverFields.has(key)));
  const {data,error}=await createClient().rpc('save_document',{p_store_id:storeId,p_kind:kind,p_header:payload,p_items:items,p_document_id:documentId});
  if(error) throw new Error(error.message);
  if(!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') throw new Error('保存結果を確認できませんでした。再操作する前に一覧を確認してください。');
  return {id:data.id};
}
