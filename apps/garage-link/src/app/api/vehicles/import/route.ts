import { handleCsvImport } from '@/lib/security/csvHandlers';
import { vehicleCsvConfig } from '@/lib/security/csvTargets';

export async function POST(request: Request) {
  return handleCsvImport(request, { ...vehicleCsvConfig, table: 'vehicles' });
}
