type RelatedRecord = Record<string, unknown> | null | undefined;

function value(row: RelatedRecord, ...keys: string[]): string {
  for (const key of keys) {
    const candidate = row?.[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

const uuidPattern = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i;

function humanValue(candidate: string): string {
  return candidate && !uuidPattern.test(candidate) ? candidate : '';
}

export function dealCustomerLabel(row: RelatedRecord): string {
  return humanValue(value(row, 'name'));
}

export function dealVehicleLabel(row: RelatedRecord): string {
  const maker = humanValue(value(row, 'maker'));
  const model = humanValue(value(row, 'model_name', 'modelName'));
  const name = [maker, model].filter(Boolean).join(' ');
  return name || humanValue(value(row, 'management_no', 'managementNo', 'registration_no', 'registrationNo'));
}

export function dealRelatedDisplayLabel(relatedId: string, label: string | null | undefined): string {
  if (!relatedId) return '未設定';
  return humanValue(label?.trim() ?? '') || '関連情報を取得できません';
}
