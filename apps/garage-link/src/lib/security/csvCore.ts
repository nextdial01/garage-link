import crypto from 'node:crypto';

const dangerousCsvPrefixPattern = /^[=+\-@\t\r]/;
const previewTokenVersion = 'csv-preview-v1';

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).replace(/\u0000/g, '').trim();

  if (dangerousCsvPrefixPattern.test(text)) {
    return `'${text}`;
  }

  return text;
}

export function sanitizeCsvRow(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeCsvCell(value)])
  );
}

export function validateCsvColumns(headers: string[], allowedHeaders: string[]) {
  const allowed = new Set(allowedHeaders);
  const unexpected = headers.filter((header) => !allowed.has(header));

  if (unexpected.length > 0) {
    throw new Error(`許可されていないカラムがあります: ${unexpected.join(', ')}`);
  }
}

export function validateRequiredCsvColumns(headers: string[], requiredHeaders: string[]) {
  const headerSet = new Set(headers);
  const missing = requiredHeaders.filter((header) => !headerSet.has(header));

  if (missing.length > 0) {
    throw new Error(`必須カラムが不足しています: ${missing.join(', ')}`);
  }
}

export function hasCsvFormulaInjection(value: unknown) {
  if (value === null || value === undefined) return false;
  return dangerousCsvPrefixPattern.test(String(value).trim());
}

export function rowsContainFormulaInjection(rows: Record<string, unknown>[]) {
  return rows.some((row) => Object.values(row).some(hasCsvFormulaInjection));
}

export function rowsToCsv(rows: Record<string, unknown>[], headers: string[]) {
  const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => {
      const sanitized = sanitizeCsvRow(row);
      return headers.map((header) => escapeCell(sanitized[header] ?? '')).join(',');
    }),
  ];

  return `\uFEFF${lines.join('\r\n')}`;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

export function parseCsv(content: string): ParsedCsv {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');

  if (lines.length < 2) {
    throw new Error('CSVにはヘッダー行とデータ行が必要です。');
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new Error('空のヘッダーがあります。');
  }

  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index]?.trim() ?? '';
      return row;
    }, {});
  });

  return { headers, rows };
}

function signingSecret() {
  return process.env.WEBHOOK_SIGNING_SECRET || process.env.APP_ENCRYPTION_KEY || '';
}

function hashRows(rows: Record<string, unknown>[]) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function createCsvPreviewToken({
  targetTable,
  storeId,
  userId,
  rows,
  expiresAt,
}: {
  targetTable: string;
  storeId: string;
  userId: string;
  rows: Record<string, unknown>[];
  expiresAt: string;
}) {
  const secret = signingSecret();
  if (!secret) {
    throw new Error('CSV preview signing secret is not configured');
  }

  const payload = {
    version: previewTokenVersion,
    targetTable,
    storeId,
    userId,
    rowHash: hashRows(rows),
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return `${encodedPayload}.${signature}`;
}

export function verifyCsvPreviewToken({
  token,
  targetTable,
  storeId,
  userId,
  rows,
}: {
  token: string;
  targetTable: string;
  storeId: string;
  userId: string;
  rows: Record<string, unknown>[];
}) {
  const secret = signingSecret();
  if (!secret) {
    throw new Error('CSV preview signing secret is not configured');
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw new Error('preview tokenが正しくありません。');
  }

  const expected = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('preview tokenが一致しません。');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    version: string;
    targetTable: string;
    storeId: string;
    userId: string;
    rowHash: string;
    expiresAt: string;
  };

  if (payload.version !== previewTokenVersion || payload.targetTable !== targetTable || payload.storeId !== storeId || payload.userId !== userId) {
    throw new Error('preview tokenの対象が一致しません。');
  }

  if (new Date(payload.expiresAt).getTime() < Date.now()) {
    throw new Error('preview tokenの有効期限が切れています。');
  }

  if (payload.rowHash !== hashRows(rows)) {
    throw new Error('preview後にCSV内容が変更されています。');
  }
}
