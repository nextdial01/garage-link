import 'server-only';

/** Keep mobile contracts allowlist-only; never spread database rows into a response. */
export const MOBILE_VEHICLE_FIELDS = 'id, management_no, vehicle_type, maker, model_name, grade, registration_no, first_registration_month, model_year, displacement_cc, mileage_km, color, inspection_expiry_date, base_price, total_price, status, location_name, description, updated_at';
export const MOBILE_CUSTOMER_FIELDS = 'id, name, kana, phone, mobile_phone, email, address, customer_status, assigned_user_name, next_action_date, updated_at';
export const MOBILE_QUOTE_FIELDS = 'id, quote_no, title, status, issue_status, issue_date, expiry_date, customer_id, vehicle_id, customer_name, customer_phone, customer_email, customer_address, customer_honorific, vehicle_label, vehicle_maker, vehicle_model_name, vehicle_year, vehicle_mileage_km, vehicle_vin, vehicle_inspection_expiry_date, subtotal_amount, tax_amount, discount_amount, trade_in_amount, total_amount, customer_note, updated_at';
export const MOBILE_QUOTE_ITEM_FIELDS = 'id, quote_id, item_order, item_type, name, description, quantity, unit_price, tax_rate, tax_amount, amount';

export function mobileVehicle(row: Record<string, unknown>) {
  return { id: row.id, managementNo: row.management_no, vehicleType: row.vehicle_type, maker: row.maker, modelName: row.model_name, grade: row.grade, registrationNo: row.registration_no, firstRegistrationMonth: row.first_registration_month, modelYear: row.model_year, displacementCc: row.displacement_cc, mileageKm: row.mileage_km, color: row.color, inspectionExpiryDate: row.inspection_expiry_date, basePrice: row.base_price, totalPrice: row.total_price, status: row.status, locationName: row.location_name, description: row.description, updatedAt: row.updated_at };
}

export function mobileQuote(row: Record<string, unknown>, items: Array<Record<string, unknown>> = []) {
  return {
    id: row.id, quoteNo: row.quote_no, title: row.title, status: row.status, issueStatus: row.issue_status,
    issueDate: row.issue_date, expiryDate: row.expiry_date, customerId: row.customer_id, vehicleId: row.vehicle_id,
    customerName: row.customer_name, customerPhone: row.customer_phone, customerEmail: row.customer_email,
    customerAddress: row.customer_address, customerHonorific: row.customer_honorific, vehicleLabel: row.vehicle_label,
    vehicleMaker: row.vehicle_maker, vehicleModelName: row.vehicle_model_name, vehicleYear: row.vehicle_year,
    vehicleMileageKm: row.vehicle_mileage_km, vehicleVin: row.vehicle_vin, vehicleInspectionExpiryDate: row.vehicle_inspection_expiry_date,
    subtotalAmount: row.subtotal_amount, taxAmount: row.tax_amount, discountAmount: row.discount_amount,
    tradeInAmount: row.trade_in_amount, totalAmount: row.total_amount, customerNote: row.customer_note, updatedAt: row.updated_at,
    items: items.map((item) => ({ id: item.id, itemOrder: item.item_order, itemType: item.item_type, name: item.name, description: item.description, quantity: item.quantity, unitPrice: item.unit_price, taxRate: item.tax_rate, taxAmount: item.tax_amount, amount: item.amount })),
  };
}

export const FORBIDDEN_MOBILE_FINANCIAL_FIELDS = ['purchase_price', 'cost_price', 'expected_profit', 'gross_profit', 'profit_rate', 'inventory_total_cost', 'expected_gross_profit', 'realized_gross_profit_this_month', 'management_target_gross_profit_yen', 'monthly_sales', 'store_sales', 'internal_memo', 'internal_note', 'work_memo'] as const;
