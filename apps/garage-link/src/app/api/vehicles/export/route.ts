import { handleCsvExport } from '@/lib/security/csvHandlers';
import { vehicleCsvConfig } from '@/lib/security/csvTargets';

export async function GET(request: Request) {
  return handleCsvExport(request, vehicleCsvConfig);
}
