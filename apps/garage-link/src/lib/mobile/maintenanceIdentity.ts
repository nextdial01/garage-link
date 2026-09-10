import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

type MaintenanceWithRelations = {
  customer_id?: string | null;
  vehicle_id?: string | null;
  [key: string]: unknown;
};

type CustomerIdentity = { id: string; name: string | null };
type VehicleIdentity = { id: string; management_no: string | null; maker: string | null; model_name: string | null };

/**
 * Adds only the customer and vehicle labels needed to identify an already
 * authorized maintenance row. The second reads repeat the resolved store
 * scope, so a relation id can never cross a mobile user's selected store.
 */
export async function withMaintenanceIdentity<T extends MaintenanceWithRelations>(
  service: SupabaseClient,
  storeId: string,
  rows: readonly T[],
): Promise<Array<T & { customerName: string | null; vehicleLabel: string | null }>> {
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const vehicleIds = [...new Set(rows.map((row) => row.vehicle_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const [customers, vehicles] = await Promise.all([
    customerIds.length
      ? service.from('customers').select('id, name').eq('store_id', storeId).in('id', customerIds)
      : Promise.resolve({ data: [] as CustomerIdentity[], error: null }),
    vehicleIds.length
      ? service.from('vehicles').select('id, management_no, maker, model_name').eq('store_id', storeId).in('id', vehicleIds)
      : Promise.resolve({ data: [] as VehicleIdentity[], error: null }),
  ]);
  if (customers.error || vehicles.error) throw new Error('maintenance_identity_read_failed');
  const customerNames = new Map((customers.data ?? []).map((customer) => [customer.id, customer.name]));
  const vehicleLabels = new Map((vehicles.data ?? []).map((vehicle) => [
    vehicle.id,
    [vehicle.management_no, vehicle.maker, vehicle.model_name].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(' / ') || null,
  ]));
  return rows.map((row) => ({
    ...row,
    customerName: row.customer_id ? customerNames.get(row.customer_id) ?? null : null,
    vehicleLabel: row.vehicle_id ? vehicleLabels.get(row.vehicle_id) ?? null : null,
  }));
}
