type VehicleLabelSource = {
  maker?: string | null;
  model_name?: string | null;
  management_no?: string | null;
  vin?: string | null;
  registration_no?: string | null;
};

function normalizeVehicleText(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }

  const trimmed = value.trim();

  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
    return '';
  }

  return trimmed;
}

export function formatVehicleLabel(vehicle: VehicleLabelSource | null | undefined) {
  if (!vehicle) {
    return '車両名未設定';
  }

  const name = `${normalizeVehicleText(vehicle.maker)} ${normalizeVehicleText(vehicle.model_name)}`.trim();

  if (name) {
    return name;
  }

  return (
    normalizeVehicleText(vehicle.management_no) ||
    normalizeVehicleText(vehicle.vin) ||
    normalizeVehicleText(vehicle.registration_no) ||
    '車両名未設定'
  );
}

export function buildDealTitleFromVehicle(vehicle: VehicleLabelSource | null | undefined) {
  const label = formatVehicleLabel(vehicle);

  if (label === '車両名未設定') {
    return '商談';
  }

  return `${label} 商談`;
}
