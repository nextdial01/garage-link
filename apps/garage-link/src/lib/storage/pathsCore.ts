import crypto from 'node:crypto';
import { extensionFromFileName, type UploadPurpose } from '@/lib/storage/validateFileCore';

export const privateStorageBucket = 'garage-private';
export const publicAssetsBucket = 'garage-public-assets';

function folderForPurpose(purpose: UploadPurpose, relatedType?: string | null, relatedId?: string | null) {
  if (purpose === 'company_logo') return 'company/logo';
  if (purpose === 'company_seal') return 'company/seal';
  if (purpose === 'line_rich_menu') return 'line/rich-menus';
  if (purpose === 'line_message_image') return 'line/messages';
  if (purpose === 'csv_import') return 'imports';
  if (purpose === 'inquiry_attachment') return 'inquiries';
  if (purpose === 'vehicle_image') {
    return relatedType === 'vehicle' && relatedId ? `vehicles/${relatedId}` : 'vehicles/unassigned';
  }
  return 'other';
}

export function buildStoragePath({
  tenantId,
  storeId,
  purpose,
  originalFileName,
  relatedType,
  relatedId,
}: {
  tenantId: string;
  storeId: string;
  purpose: UploadPurpose;
  originalFileName: string;
  relatedType?: string | null;
  relatedId?: string | null;
}) {
  const extension = extensionFromFileName(originalFileName) || '.bin';
  const fileId = crypto.randomUUID();
  const folder = folderForPurpose(purpose, relatedType, relatedId);

  return {
    fileId,
    safeFilename: `${fileId}${extension}`,
    path: `tenants/${tenantId}/stores/${storeId}/${folder}/${fileId}${extension}`,
  };
}

export function isPathInStoreScope({
  path,
  tenantId,
  storeId,
}: {
  path: string;
  tenantId: string;
  storeId: string;
}) {
  return path.startsWith(`tenants/${tenantId}/stores/${storeId}/`);
}
