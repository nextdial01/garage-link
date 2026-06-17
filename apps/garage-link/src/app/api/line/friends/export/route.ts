import { handleCsvExport } from '@/lib/security/csvHandlers';
import { lineFriendCsvConfig } from '@/lib/security/csvTargets';

export async function GET(request: Request) {
  return handleCsvExport(request, lineFriendCsvConfig);
}
