import 'server-only';

export type CsvImportTarget = 'customers' | 'vehicles';
export type CsvExportTarget = CsvImportTarget | 'line_friends';

export type CsvTargetConfig = {
  table: CsvExportTarget;
  label: string;
  exportColumns: string[];
  importColumns?: string[];
  requiredImportColumns?: string[];
  featureCode: 'customer' | 'vehicle' | 'line';
  hasTenantColumn?: boolean;
};

export const customerCsvConfig: CsvTargetConfig = {
  table: 'customers',
  label: '顧客',
  featureCode: 'customer',
  exportColumns: [
    'name',
    'kana',
    'phone',
    'mobile_phone',
    'email',
    'postal_code',
    'address',
    'customer_type',
    'line_display_name',
    'line_friend_status',
    'delivery_permission',
    'customer_status',
    'assigned_user_name',
    'next_action_date',
    'memo',
  ],
  importColumns: [
    'name',
    'kana',
    'phone',
    'mobile_phone',
    'email',
    'postal_code',
    'address',
    'customer_type',
    'customer_status',
    'memo',
  ],
  requiredImportColumns: ['name'],
};

export const vehicleCsvConfig: CsvTargetConfig = {
  table: 'vehicles',
  label: '車両',
  featureCode: 'vehicle',
  exportColumns: [
    'management_no',
    'vehicle_type',
    'maker',
    'model_name',
    'grade',
    'vin',
    'registration_no',
    'model_year',
    'mileage_km',
    'color',
    'base_price',
    'total_price',
    'status',
    'location_name',
  ],
  importColumns: [
    'management_no',
    'vehicle_type',
    'maker',
    'model_name',
    'grade',
    'vin',
    'registration_no',
    'model_year',
    'mileage_km',
    'color',
    'base_price',
    'total_price',
    'status',
    'location_name',
  ],
  requiredImportColumns: ['management_no'],
};

export const lineFriendCsvConfig: CsvTargetConfig = {
  table: 'line_friends',
  label: 'LINE友だち',
  featureCode: 'line',
  hasTenantColumn: true,
  exportColumns: [
    'line_display_name',
    'friend_status',
    'delivery_permission',
    'source_route',
    'last_interaction_at',
    'created_at',
  ],
};

export function csvExportFileName(target: CsvExportTarget) {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `garage-link-${target}-${timestamp}.csv`;
}
