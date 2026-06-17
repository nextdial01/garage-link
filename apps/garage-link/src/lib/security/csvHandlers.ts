import 'server-only';
import {
  createCsvPreviewToken,
  parseCsv,
  rowsContainFormulaInjection,
  rowsToCsv,
  sanitizeCsvRow,
  validateCsvColumns,
  validateRequiredCsvColumns,
  verifyCsvPreviewToken,
} from '@/lib/security/csv';
import {
  CSV_EXPORT_ROW_LIMIT,
  CSV_IMPORT_ROW_LIMIT,
  CSV_MAX_FILE_SIZE_BYTES,
  canExportCsv,
  canImportCsv,
  denyCsvOperation,
  getCsvAuthContext,
  logCsvAudit,
  logDataExport,
  logDataImport,
} from '@/lib/security/csvApi';
import { enforceSecurityRateLimit } from '@/lib/security/rateLimit';
import { csvExportFileName, type CsvImportTarget, type CsvTargetConfig } from '@/lib/security/csvTargets';

type PreviewRequestBody = {
  action: 'preview';
  fileName?: string;
  mimeType?: string;
  content?: string;
};

type CommitRequestBody = {
  action: 'commit';
  rows?: Record<string, unknown>[];
  previewToken?: string;
};

const allowedCsvMimeTypes = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
  '',
]);

function contentSize(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

function normalizeNumber(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeForImport(rows: Record<string, unknown>[]) {
  return rows.map((row) => sanitizeCsvRow(row));
}

function toCustomerInsert(row: Record<string, string>, storeId: string) {
  return {
    store_id: storeId,
    name: row.name,
    kana: row.kana || null,
    phone: row.phone || null,
    mobile_phone: row.mobile_phone || null,
    email: row.email || null,
    postal_code: row.postal_code || null,
    address: row.address || null,
    customer_type: row.customer_type || 'individual',
    customer_status: row.customer_status || 'new',
    memo: row.memo || null,
  };
}

function toVehicleInsert(row: Record<string, string>, storeId: string) {
  return {
    store_id: storeId,
    management_no: row.management_no,
    vehicle_type: row.vehicle_type || 'bike',
    maker: row.maker || null,
    model_name: row.model_name || null,
    grade: row.grade || null,
    vin: row.vin || null,
    registration_no: row.registration_no || null,
    model_year: normalizeNumber(row.model_year),
    mileage_km: normalizeNumber(row.mileage_km),
    color: row.color || null,
    base_price: normalizeNumber(row.base_price),
    total_price: normalizeNumber(row.total_price),
    status: row.status || 'stock',
    location_name: row.location_name || null,
  };
}

function buildImportRows(target: CsvImportTarget, rows: Record<string, string>[], storeId: string) {
  if (target === 'customers') {
    return rows.map((row) => toCustomerInsert(row, storeId));
  }

  return rows.map((row) => toVehicleInsert(row, storeId));
}

function validateUploadBody(body: PreviewRequestBody) {
  const fileName = body.fileName ?? '';
  const mimeType = body.mimeType ?? '';
  const content = body.content ?? '';

  if (!fileName.toLowerCase().endsWith('.csv')) {
    throw new Error('CSVファイルを選択してください。');
  }

  if (!allowedCsvMimeTypes.has(mimeType)) {
    throw new Error('CSVとして扱えないファイル形式です。');
  }

  if (contentSize(content) > CSV_MAX_FILE_SIZE_BYTES) {
    throw new Error('CSVファイルのサイズが大きすぎます。');
  }

  return content;
}

async function logFormulaInjectionIfNeeded({
  context,
  rows,
  targetTable,
}: {
  context: Awaited<ReturnType<typeof getCsvAuthContext>> & { ok: true };
  rows: Record<string, unknown>[];
  targetTable: string;
}) {
  if (!rowsContainFormulaInjection(rows)) return;

  await denyCsvOperation({
    supabase: context.supabase,
    tenantId: context.member.tenantId,
    userId: context.user.id,
    eventType: 'csv_formula_injection_detected',
    ipAddress: context.ipAddress,
    details: { target_table: targetTable, row_count: rows.length },
    message: 'CSV内に危険な式として扱われる可能性がある値がありました。安全化して処理します。',
    status: 200,
  });
}

export async function handleCsvExport(request: Request, config: CsvTargetConfig) {
  const context = await getCsvAuthContext(request);
  if (!context.ok) return context.response;

  if (!canExportCsv(context.member.role)) {
    return denyCsvOperation({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      userId: context.user.id,
      eventType: 'export_access_denied',
      ipAddress: context.ipAddress,
      details: { target_table: config.table },
    });
  }

  try {
    await enforceSecurityRateLimit({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      userId: context.user.id,
      ipAddress: context.ipAddress,
      action: 'csv_export',
    });

    const { data, error } = config.hasTenantColumn && context.member.tenantId
      ? await context.supabase
        .from(config.table)
        .select(config.exportColumns.join(', '))
        .eq('store_id', context.member.storeId)
        .eq('tenant_id', context.member.tenantId)
      : await context.supabase
        .from(config.table)
        .select(config.exportColumns.join(', '))
        .eq('store_id', context.member.storeId);

    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];

    if (rows.length > CSV_EXPORT_ROW_LIMIT) {
      await logDataExport({
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        storeId: context.member.storeId,
        userId: context.user.id,
        targetTable: config.table,
        rowCount: rows.length,
        columnsExported: config.exportColumns,
        ipAddress: context.ipAddress,
        userAgentValue: context.userAgent,
        status: 'blocked_large_export',
      });

      return denyCsvOperation({
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        eventType: 'large_export_requested',
        ipAddress: context.ipAddress,
        details: { target_table: config.table, limit: CSV_EXPORT_ROW_LIMIT },
        message: '出力件数が上限を超えています。条件を絞り込んでください。',
        status: 413,
      });
    }

    await logFormulaInjectionIfNeeded({ context, rows, targetTable: config.table });

    await logDataExport({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
      userId: context.user.id,
      targetTable: config.table,
      rowCount: rows.length,
      columnsExported: config.exportColumns,
      ipAddress: context.ipAddress,
      userAgentValue: context.userAgent,
    });

    await logCsvAudit({
      supabase: context.supabase,
      storeId: context.member.storeId,
      userId: context.user.id,
      userEmail: context.member.email,
      userRole: context.member.role,
      userDisplayName: context.member.displayName,
      action: 'data_export_completed',
      targetTable: config.table,
      rowCount: rows.length,
    });

    return new Response(rowsToCsv(rows, config.exportColumns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvExportFileName(config.table)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    await logDataExport({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
      userId: context.user.id,
      targetTable: config.table,
      rowCount: 0,
      columnsExported: config.exportColumns,
      ipAddress: context.ipAddress,
      userAgentValue: context.userAgent,
      status: 'failed',
    });

    await logCsvAudit({
      supabase: context.supabase,
      storeId: context.member.storeId,
      userId: context.user.id,
      userEmail: context.member.email,
      userRole: context.member.role,
      userDisplayName: context.member.displayName,
      action: 'data_export_failed',
      targetTable: config.table,
      rowCount: 0,
    });

    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'CSV出力に失敗しました。' }, { status: 500 });
  }
}

export async function handleCsvImport(request: Request, config: CsvTargetConfig & { table: CsvImportTarget }) {
  const context = await getCsvAuthContext(request);
  if (!context.ok) return context.response;

  if (!canImportCsv(context.member.role)) {
    return denyCsvOperation({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      userId: context.user.id,
      eventType: 'import_access_denied',
      ipAddress: context.ipAddress,
      details: { target_table: config.table },
    });
  }

  const body = (await request.json()) as PreviewRequestBody | CommitRequestBody;

  try {
    if (body.action === 'preview') {
      await enforceSecurityRateLimit({
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        userId: context.user.id,
        ipAddress: context.ipAddress,
        action: 'csv_import_preview',
      });

      const content = validateUploadBody(body);
      const parsed = parseCsv(content);
      validateCsvColumns(parsed.headers, config.importColumns ?? []);
      validateRequiredCsvColumns(parsed.headers, config.requiredImportColumns ?? []);

      if (parsed.rows.length > CSV_IMPORT_ROW_LIMIT) {
        throw new Error(`1回の取り込み上限は${CSV_IMPORT_ROW_LIMIT}件です。`);
      }

      await logFormulaInjectionIfNeeded({ context, rows: parsed.rows, targetTable: config.table });
      const safeRows = sanitizeForImport(parsed.rows);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const previewToken = createCsvPreviewToken({
        targetTable: config.table,
        storeId: context.member.storeId,
        userId: context.user.id,
        rows: safeRows,
        expiresAt,
      });

      await logDataImport({
        supabase: context.supabase,
        tenantId: context.member.tenantId,
        storeId: context.member.storeId,
        userId: context.user.id,
        targetTable: config.table,
        rowCount: safeRows.length,
        successCount: 0,
        failedCount: 0,
        ipAddress: context.ipAddress,
        userAgentValue: context.userAgent,
        status: 'previewed',
      });

      await logCsvAudit({
        supabase: context.supabase,
        storeId: context.member.storeId,
        userId: context.user.id,
        userEmail: context.member.email,
        userRole: context.member.role,
        userDisplayName: context.member.displayName,
        action: 'data_import_previewed',
        targetTable: config.table,
        rowCount: safeRows.length,
      });

      return Response.json({
        ok: true,
        action: 'preview',
        targetTable: config.table,
        rowCount: safeRows.length,
        previewRows: safeRows.slice(0, 20),
        rows: safeRows,
        previewToken,
        expiresAt,
      });
    }

    if (body.action !== 'commit') {
      throw new Error('CSV importの操作が正しくありません。');
    }

    await enforceSecurityRateLimit({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      userId: context.user.id,
      ipAddress: context.ipAddress,
      action: 'csv_import_commit',
    });

    const rows = sanitizeForImport(body.rows ?? []);
    if (!body.previewToken) {
      throw new Error('preview確認が完了していません。');
    }

    if (rows.length === 0) {
      throw new Error('取り込み対象の行がありません。');
    }

    if (rows.length > CSV_IMPORT_ROW_LIMIT) {
      throw new Error(`1回の取り込み上限は${CSV_IMPORT_ROW_LIMIT}件です。`);
    }

    validateCsvColumns(Object.keys(rows[0] ?? {}), config.importColumns ?? []);
    validateRequiredCsvColumns(Object.keys(rows[0] ?? {}), config.requiredImportColumns ?? []);
    verifyCsvPreviewToken({
      token: body.previewToken,
      targetTable: config.table,
      storeId: context.member.storeId,
      userId: context.user.id,
      rows,
    });

    const inserts = buildImportRows(config.table, rows, context.member.storeId);
    const { error } = await context.supabase.from(config.table).insert(inserts);
    if (error) throw error;

    await logDataImport({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
      userId: context.user.id,
      targetTable: config.table,
      rowCount: rows.length,
      successCount: rows.length,
      failedCount: 0,
      ipAddress: context.ipAddress,
      userAgentValue: context.userAgent,
      status: 'committed',
    });

    await logCsvAudit({
      supabase: context.supabase,
      storeId: context.member.storeId,
      userId: context.user.id,
      userEmail: context.member.email,
      userRole: context.member.role,
      userDisplayName: context.member.displayName,
      action: 'data_import_committed',
      targetTable: config.table,
      rowCount: rows.length,
    });

    return Response.json({ ok: true, action: 'commit', insertedCount: rows.length });
  } catch (error) {
    await logDataImport({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      storeId: context.member.storeId,
      userId: context.user.id,
      targetTable: config.table,
      rowCount: 0,
      successCount: 0,
      failedCount: 0,
      ipAddress: context.ipAddress,
      userAgentValue: context.userAgent,
      status: 'failed',
      errorSummary: { code: 'csv_import_failed' },
    });

    await logCsvAudit({
      supabase: context.supabase,
      storeId: context.member.storeId,
      userId: context.user.id,
      userEmail: context.member.email,
      userRole: context.member.role,
      userDisplayName: context.member.displayName,
      action: 'data_import_failed',
      targetTable: config.table,
      rowCount: 0,
    });

    await denyCsvOperation({
      supabase: context.supabase,
      tenantId: context.member.tenantId,
      userId: context.user.id,
      eventType: 'csv_invalid_format',
      ipAddress: context.ipAddress,
      details: { target_table: config.table },
      message: 'CSVの形式が正しくありません。',
      status: 400,
    });

    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'CSV取り込みに失敗しました。' }, { status: 400 });
  }
}
