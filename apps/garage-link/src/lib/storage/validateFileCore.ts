export type UploadPurpose =
  | 'company_logo'
  | 'company_seal'
  | 'vehicle_image'
  | 'line_rich_menu'
  | 'line_message_image'
  | 'csv_import'
  | 'inquiry_attachment'
  | 'other';

export type FileType = 'image' | 'csv' | 'pdf';

export type FileValidationRule = {
  fileType: FileType;
  maxBytes: number;
  mimeTypes: string[];
  extensions: string[];
};

const mb = 1024 * 1024;

const imageRule: FileValidationRule = {
  fileType: 'image',
  maxBytes: 5 * mb,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
};

const csvRule: FileValidationRule = {
  fileType: 'csv',
  maxBytes: 2 * mb,
  mimeTypes: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  extensions: ['.csv'],
};

const pdfRule: FileValidationRule = {
  fileType: 'pdf',
  maxBytes: 10 * mb,
  mimeTypes: ['application/pdf'],
  extensions: ['.pdf'],
};

export const uploadPurposeRules: Record<UploadPurpose, FileValidationRule> = {
  company_logo: imageRule,
  company_seal: imageRule,
  vehicle_image: imageRule,
  line_rich_menu: imageRule,
  line_message_image: imageRule,
  csv_import: csvRule,
  inquiry_attachment: pdfRule,
  other: imageRule,
};

export function extensionFromFileName(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? '';
}

export function validateUploadFile({
  file,
  purpose,
}: {
  file: File;
  purpose: UploadPurpose;
}) {
  const rule = uploadPurposeRules[purpose];
  const extension = extensionFromFileName(file.name);
  const mimeType = file.type || 'application/octet-stream';

  if (!rule.extensions.includes(extension)) {
    return {
      ok: false as const,
      reason: 'invalid_extension',
      message: '許可されていない拡張子です。',
      rule,
    };
  }

  if (!rule.mimeTypes.includes(mimeType)) {
    return {
      ok: false as const,
      reason: 'invalid_mime_type',
      message: '許可されていないファイル形式です。',
      rule,
    };
  }

  if (file.size > rule.maxBytes) {
    return {
      ok: false as const,
      reason: 'file_too_large',
      message: 'ファイルサイズが上限を超えています。',
      rule,
    };
  }

  return {
    ok: true as const,
    rule,
    extension,
    mimeType,
    sizeBytes: file.size,
  };
}
