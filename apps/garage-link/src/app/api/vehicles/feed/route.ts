import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { vehicleFeedCsv, type FeedVehicle } from '@/lib/vehicles/vehicle-feed';

export const dynamic = 'force-dynamic';

type StoreMemberRow = { store_id: string };
export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) return NextResponse.json({ ok: false, error: 'ログインが必要です。' }, { status: 401 });

  const { data: member, error: memberError } = await supabase.from<StoreMemberRow>('store_members').select('store_id').eq('user_id', userData.user.id).single();
  if (memberError || !member?.store_id) return NextResponse.json({ ok: false, error: '所属店舗が見つかりません。' }, { status: 403 });
  const { data, error } = await supabase.from('vehicles').select('id, management_no, maker, model_name, grade, model_year, mileage_km, color, total_price, base_price, description, status, location_name, listing_price, updated_at, deleted_at').eq('store_id', member.store_id).eq('is_archived', false).order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: '在庫フィードを作成できませんでした。' }, { status: 500 });
  const activeVehicles = ((data ?? []) as Array<FeedVehicle & { deleted_at?: string | null }>).filter((vehicle) => !vehicle.deleted_at);
  return new NextResponse(vehicleFeedCsv(activeVehicles), { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' } });
}
