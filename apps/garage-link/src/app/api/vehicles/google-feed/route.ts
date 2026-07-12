import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { googleVehicleFeedCsv, type FeedVehicle } from '@/lib/vehicles/vehicle-feed';

export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const token = process.env.VEHICLE_FEED_TOKEN;
  if (!token) return false;
  const header = request.headers.get('authorization') ?? '';
  const urlToken = new URL(request.url).searchParams.get('token') ?? '';
  return header === `Bearer ${token}` || urlToken === token;
}

export async function GET(request: Request) {
  if (process.env.VEHICLE_FEED_GOOGLE_ENABLED !== 'true') return NextResponse.json({ ok: false, error: '現在はGoogle車両リスティングを公開していません。対象国・契約条件を確認後に有効化してください。' }, { status: 503 });
  if (!process.env.VEHICLE_FEED_TOKEN) return NextResponse.json({ ok: false, error: '在庫フィードの公開設定が未完了です。管理者がトークンを設定してください。' }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ ok: false, error: '在庫フィードの認証に失敗しました。' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return NextResponse.json({ ok: false, error: '在庫フィードのサーバー設定が未完了です。' }, { status: 503 });
  const supabase = createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const storeId = process.env.VEHICLE_FEED_STORE_ID;
  if (!storeId) return NextResponse.json({ ok: false, error: '在庫フィードの店舗設定が未完了です。' }, { status: 503 });
  const { data: store, error: storeError } = await supabase.from('stores').select('id, name, address').eq('id', storeId).single();
  if (storeError || !store) return NextResponse.json({ ok: false, error: '掲載店舗が見つかりません。' }, { status: 404 });
  const { data, error } = await supabase.from('vehicles').select('id, vin, management_no, maker, model_name, grade, model_year, mileage_km, color, total_price, base_price, description, status, location_name, listing_price, updated_at, deleted_at').eq('store_id', store.id).eq('is_archived', false).order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: 'Google向け在庫フィードを作成できませんでした。' }, { status: 500 });
  return new NextResponse(googleVehicleFeedCsv((data ?? []).filter((vehicle) => !vehicle.deleted_at && vehicle.vin && vehicle.model_year && vehicle.mileage_km !== null && (vehicle.total_price ?? vehicle.listing_price ?? vehicle.base_price) !== null) as FeedVehicle[], store.name ?? '販売店', store.address ?? ''), { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' } });
}
