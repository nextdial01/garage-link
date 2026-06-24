import crypto from 'node:crypto';
import { extensionFromFileName, type UploadPurpose } from '@/lib/storage/validateFileCore';

export const privateStorageBucket = 'garage-private';
export const publicAssetsBucket = 'garage-public-assets';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowedRelatedTypes = new Set(['vehicle']);

export function isSafePathSegment(value: string) {
  if (!value || value.length > 128) return false;
  if (value === '.' || value === '..') return false;
  if (value.includes('/') || value.includes('\\') || value.includes('\0')) return false;
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && uuidRegex.test(value);
}

export function isSafeStoragePath(path: string) {
  if (!path || path.length > 1024) return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (path.includes('\\') || path.includes('\0') || path.includes('//')) return false;
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return true;
}

function folderForPurpose(purpose: UploadPurpose, relatedType?: string | null, relatedId?: string | null) {
  if (purpose === 'company_logo') return 'company/logo';
  if (purpose === 'company_seal') return 'company/seal';
  if (purpose === 'line_rich_menu') return 'line/rich-menus';
  if (purpose === 'line_message_image') return 'line/messages';
  if (purpose === 'csv_import') return 'imports';
  if (purpose === 'inquiry_attachment') return 'inquiries';
  if (purpose === 'vehicle_image') {
    if (
      relatedType &&
      allowedRelatedTypes.has(relatedType) &&
      isValidUuid(relatedId)
    ) {
      return `vehicles/${relatedId}`;
    }
    return 'vehicles/unassigned';
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
  if (!isValidUuid(tenantId) || !isValidUuid(storeId)) {
    throw new Error('storage path: tenantId/storeIdが不正です。');
  }

  const extension = extensionFromFileName(originalFileName) || '.bin';
  if (!/^\.[a-z0-9]+$/.test(extension)) {
    throw new Error('storage path: 拡張子が不正です。');
  }

  const fileId = crypto.randomUUID();
  const folder = folderForPurpose(purpose, relatedType, relatedId);
  const path = `tenants/${tenantId}/stores/${storeId}/${folder}/${fileId}${extension}`;

  if (!isSafeStoragePath(path)) {
    throw new Error('storage path: 生成pathが安全条件を満たしません。');
  }

  return {
    fileId,
    safeFilename: `${fileId}${extension}`,
    path,
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
  if (!isValidUuid(tenantId) || !isValidUuid(storeId)) return false;
  if (!isSafeStoragePath(path)) return false;
  return path.startsWith(`tenants/${tenantId}/stores/${storeId}/`);
}
