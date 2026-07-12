export type FeedVehicle = {
  id: string;
  management_no: string | null;
  vin?: string | null;
  maker: string | null;
  model_name: string | null;
  grade: string | null;
  model_year: number | null;
  mileage_km: number | null;
  color: string | null;
  total_price: number | null;
  base_price: number | null;
  description: string | null;
  status: string | null;
  location_name: string | null;
  listing_price: number | null;
  updated_at: string | null;
};

function csvValue(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function publicVehicles(vehicles: FeedVehicle[]) {
  return vehicles.filter((vehicle) => ['在庫中', '展示中', 'in_stock'].includes(vehicle.status ?? ''));
}

export function vehicleFeedCsv(vehicles: FeedVehicle[]) {
  const headers = ['id', '管理番号', 'メーカー', '車名', 'グレード', '年式', '走行距離km', '色', '車両本体価格', '支払総額', '掲載価格', '説明', '在庫状態', '店舗名', '更新日時'];
  const rows = publicVehicles(vehicles).map((vehicle) => [
    vehicle.id, vehicle.management_no, vehicle.maker, vehicle.model_name, vehicle.grade, vehicle.model_year,
    vehicle.mileage_km, vehicle.color, vehicle.base_price, vehicle.total_price, vehicle.listing_price,
    vehicle.description, vehicle.status, vehicle.location_name, vehicle.updated_at,
  ].map(csvValue).join(','));
  return `\uFEFF${headers.map(csvValue).join(',')}\n${rows.join('\n')}\n`;
}

export function googleVehicleFeedCsv(vehicles: FeedVehicle[], storeName: string, storeAddress: string) {
  const headers = ['vin', 'id', 'store_code', 'dealership_name', 'dealership_address', 'title', 'description', 'price', 'condition', 'make', 'model', 'trim', 'year', 'mileage', 'exterior_color', 'vehicle_fulfillment', 'link'];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const rows = publicVehicles(vehicles).map((vehicle) => [
    vehicle.vin,
    vehicle.id,
    `garage-link-${vehicle.id}`,
    storeName,
    storeAddress,
    `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim(),
    vehicle.description,
    `${vehicle.total_price ?? vehicle.listing_price ?? vehicle.base_price ?? ''} JPY`,
    'used',
    vehicle.maker,
    vehicle.model_name,
    vehicle.grade,
    vehicle.model_year,
    vehicle.mileage_km,
    vehicle.color,
    'IN_STORE',
    `${baseUrl}/vehicles/${vehicle.id}`,
  ].map(csvValue).join(','));
  return `\uFEFF${headers.map(csvValue).join(',')}\n${rows.join('\n')}\n`;
}
