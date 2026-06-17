import { handleCsvExport } from '@/lib/security/csvHandlers';
import { customerCsvConfig } from '@/lib/security/csvTargets';

export async function GET(request: Request) {
  return handleCsvExport(request, customerCsvConfig);
}
