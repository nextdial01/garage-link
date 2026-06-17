import { handleCsvImport } from '@/lib/security/csvHandlers';
import { customerCsvConfig } from '@/lib/security/csvTargets';

export async function POST(request: Request) {
  return handleCsvImport(request, { ...customerCsvConfig, table: 'customers' });
}
