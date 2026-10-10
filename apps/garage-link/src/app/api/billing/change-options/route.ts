import {wiredOption,wiredOptionStatus} from '../../../../../release-candidates/issue46/addonWiring';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type MemberRow = { tenant_id: string; store_id: string; role: string | null };

// Server-owned release admission remains closed until the exact release is approved.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });
  const { data: member } = await supabase.from<MemberRow>('current_user_active_store_membership').select('tenant_id, store_id, role').eq('user_id', userData.user.id).eq('status', 'active').single();
  if (!member?.store_id || !['owner', 'admin'].includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '契約を変更する権限がありません。' }, { status: 403 });
  }
  try { const result=await wiredOption(request,member,userData.user.id); if(result)return NextResponse.json({ok:result.status<400,...result},{status:result.status}); } catch { return NextResponse.json({ok:false,error:'追加購入の条件または認証を確認してください。',code:'commercial_option_rejected'},{status:403}); }
  return NextResponse.json(
    { ok: false, error: '追加オプションは現在受け付けていません。' },
    { status: 403 },
  );
}

// Read-only intent recovery. Same authentication, AAL2, scope and readiness as POST.
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'};
 const supabase=await createClient();const {data:userData}=await supabase.auth.getUser();
 if(!userData.user?.id)return NextResponse.json({ok:false},{status:401,headers});
 const {data:member}=await supabase.from<MemberRow>('current_user_active_store_membership').select('tenant_id, store_id, role').eq('user_id',userData.user.id).eq('status','active').single();
 if(!member?.store_id||!['owner','admin'].includes(member.role??''))return NextResponse.json({ok:false},{status:403,headers});
 try{const result=await wiredOptionStatus(request,member,userData.user.id);if(result)return NextResponse.json({ok:true,...result},{headers});}catch{}
 return NextResponse.json({ok:false},{status:403,headers});
}
