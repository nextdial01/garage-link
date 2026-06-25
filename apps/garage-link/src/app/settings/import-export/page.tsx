'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { logAudit } from '@/lib/audit/logAudit';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name?: string | null;
  email?: string | null;
};

type ExportRow = Record<string, unknown> & {
  id?: string;
  store_id?: string;
  created_at?: string;
  updated_at?: string;
};

type ExportTables = {
  line_settings: ExportRow[];
  line_tags: ExportRow[];
  line_templates: ExportRow[];
  line_campaigns: ExportRow[];
  line_steps: ExportRow[];
  line_step_messages: ExportRow[];
  line_forms: ExportRow[];
  line_form_questions: ExportRow[];
  line_rich_menus: ExportRow[];
  line_auto_replies: ExportRow[];
  line_routes: ExportRow[];
};

type ExportPayload = {
  version: '1.0';
  exportedAt: string;
  app: 'GARAGE_LINK';
  type: 'store_settings_template';
  tables: ExportTables;
  storeDocumentSettings?: {
    quote_note?: string | null;
    invoice_note?: string | null;
    document_primary_color?: string | null;
    document_footer_text?: string | null;
  } | null;
};

type StoreDocumentSettings = NonNullable<ExportPayload['storeDocumentSettings']>;

type ImportTargetKey =
  | 'line_settings'
  | 'line_tags'
  | 'line_templates'
  | 'line_campaigns'
  | 'line_steps'
  | 'line_forms'
  | 'line_rich_menus'
  | 'line_auto_replies'
  | 'line_routes';

type CsvTargetKey = 'customers' | 'vehicles' | 'line_friends';
type CsvImportTargetKey = 'customers' | 'vehicles';

type CsvPreviewResponse = {
  ok: boolean;
  rowCount?: number;
  previewRows?: Record<string, string>[];
  rows?: Record<string, string>[];
  previewToken?: string;
  expiresAt?: string;
  error?: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const allowedRoles = ['owner', 'admin', 'implementer'];
const csvAllowedRoles = ['owner', 'admin'];

const exportTableNames: (keyof ExportTables)[] = [
  'line_settings',
  'line_tags',
  'line_templates',
  'line_campaigns',
  'line_steps',
  'line_step_messages',
  'line_forms',
  'line_form_questions',
  'line_rich_menus',
  'line_auto_replies',
  'line_routes',
];

const importTargets: { key: ImportTargetKey; label: string; childTables?: (keyof ExportTables)[] }[] = [
  { key: 'line_settings', label: 'LINE設定' },
  { key: 'line_tags', label: 'タグ' },
  { key: 'line_templates', label: 'テンプレート' },
  { key: 'line_campaigns', label: '一斉配信' },
  { key: 'line_steps', label: 'シナリオ配信', childTables: ['line_step_messages'] },
  { key: 'line_forms', label: '回答フォーム', childTables: ['line_form_questions'] },
  { key: 'line_rich_menus', label: 'リッチメニュー' },
  { key: 'line_auto_replies', label: '自動応答' },
  { key: 'line_routes', label: '流入経路' },
];

const csvExportTargets: { key: CsvTargetKey; label: string; endpoint: string; description: string }[] = [
  { key: 'customers', label: '顧客情報', endpoint: '/api/customers/export', description: '氏名、連絡先、対応状況などを出力します。' },
  { key: 'vehicles', label: '車両情報', endpoint: '/api/vehicles/export', description: '管理番号、車両情報、価格、ステータスなどを出力します。' },
  // LINE友だちのエクスポートは L-LINK 側へ移管したため、GARAGE LINK の導線からは外しています。
];

const csvImportTargets: { key: CsvImportTargetKey; label: string; endpoint: string }[] = [
  { key: 'customers', label: '顧客情報', endpoint: '/api/customers/import' },
  { key: 'vehicles', label: '車両情報', endpoint: '/api/vehicles/import' },
];

const safeLineSettingsColumns = [
  'line_account_name',
  'basic_id',
  'webhook_url',
  'connection_status',
  'webhook_enabled',
  'signature_verification_enabled',
  'default_sender_name',
  'unsubscribe_message',
  'friend_add_message',
  'block_handling',
  'default_delivery_permission',
  'quiet_hours_enabled',
  'quiet_hours_start',
  'quiet_hours_end',
  'internal_memo',
].join(', ');

const tableLabels: Record<keyof ExportTables, string> = {
  line_settings: 'LINE設定',
  line_tags: 'タグ',
  line_templates: 'テンプレート',
  line_campaigns: '一斉配信',
  line_steps: 'シナリオ配信',
  line_step_messages: 'ステップメッセージ',
  line_forms: '回答フォーム',
  line_form_questions: 'フォーム質問',
  line_rich_menus: 'リッチメニュー',
  line_auto_replies: '自動応答',
  line_routes: '流入経路',
};

const emptyTables = (): ExportTables => ({
  line_settings: [],
  line_tags: [],
  line_templates: [],
  line_campaigns: [],
  line_steps: [],
  line_step_messages: [],
  line_forms: [],
  line_form_questions: [],
  line_rich_menus: [],
  line_auto_replies: [],
  line_routes: [],
});

function timestampForFileName() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function downloadJson(payload: ExportPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `garage-link-settings-${timestampForFileName()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function omitImportManagedColumns(row: ExportRow) {
  const { id, store_id, created_at, updated_at, ...rest } = row;
  void id;
  void store_id;
  void created_at;
  void updated_at;
  return rest;
}

function appendCopyName(value: unknown, usedValues: Set<string>) {
  const base = typeof value === 'string' && value.trim() !== '' ? value.trim() : '名称未設定';
  let nextValue = base;

  if (usedValues.has(nextValue)) {
    nextValue = `${base} コピー`;
  }

  let index = 2;
  while (usedValues.has(nextValue)) {
    nextValue = `${base} コピー${index}`;
    index += 1;
  }

  usedValues.add(nextValue);
  return nextValue;
}

function appendCopyCode(value: unknown, usedValues: Set<string>) {
  const base = typeof value === 'string' && value.trim() !== '' ? value.trim() : `code-${Date.now()}`;
  let nextValue = base;

  if (usedValues.has(nextValue)) {
    nextValue = `${base}-copy-${Date.now()}`;
  }

  while (usedValues.has(nextValue)) {
    nextValue = `${base}-copy-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  usedValues.add(nextValue);
  return nextValue;
}

function validateImportPayload(value: unknown): ExportPayload {
  if (!value || typeof value !== 'object') {
    throw new Error('JSON形式が正しくありません。');
  }

  const payload = value as Partial<ExportPayload>;
  if (payload.app !== 'GARAGE_LINK' || payload.type !== 'store_settings_template' || payload.version !== '1.0') {
    throw new Error('GARAGE LINKの設定テンプレートJSONではありません。');
  }

  if (!payload.tables || typeof payload.tables !== 'object') {
    throw new Error('tablesが見つかりません。');
  }

  return {
    version: '1.0',
    exportedAt: String(payload.exportedAt ?? ''),
    app: 'GARAGE_LINK',
    type: 'store_settings_template',
    tables: { ...emptyTables(), ...payload.tables },
    storeDocumentSettings: payload.storeDocumentSettings ?? null,
  };
}

function countTargetRows(payload: ExportPayload | null, key: ImportTargetKey) {
  if (!payload) {
    return 0;
  }

  if (key === 'line_steps') {
    return payload.tables.line_steps.length + payload.tables.line_step_messages.length;
  }

  if (key === 'line_forms') {
    return payload.tables.line_forms.length + payload.tables.line_form_questions.length;
  }

  return payload.tables[key].length;
}

function hasImportExportPermission(role: string | null | undefined) {
  return allowedRoles.includes(role ?? '');
}

function hasCsvPermission(role: string | null | undefined) {
  return csvAllowedRoles.includes(role ?? '');
}

async function getAuthorizedContext() {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    throw new Error('ログイン情報を取得できませんでした。');
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role, display_name, email')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id) {
    throw new Error('所属店舗を取得できませんでした。');
  }

  if (!hasImportExportPermission(member.role)) {
    throw new Error('権限がありません');
  }

  return { supabase, user: userData.user, member };
}

export default function SettingsImportExportPage() {
  const [importPayload, setImportPayload] = useState<ExportPayload | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<Record<ImportTargetKey, boolean>>(() =>
    importTargets.reduce<Record<ImportTargetKey, boolean>>((result, target) => {
      result[target.key] = true;
      return result;
    }, {} as Record<ImportTargetKey, boolean>)
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [csvExportTarget, setCsvExportTarget] = useState<CsvTargetKey>('customers');
  const [csvImportTarget, setCsvImportTarget] = useState<CsvImportTargetKey>('customers');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<Record<string, string>[]>([]);
  const [csvPreviewToken, setCsvPreviewToken] = useState('');
  const [csvPreviewCount, setCsvPreviewCount] = useState(0);
  const [csvConfirmChecked, setCsvConfirmChecked] = useState(false);
  const [isCsvExporting, setIsCsvExporting] = useState(false);
  const [isCsvPreviewing, setIsCsvPreviewing] = useState(false);
  const [isCsvCommitting, setIsCsvCommitting] = useState(false);

  useEffect(() => {
    async function checkPermission() {
      try {
        const { member } = await getAuthorizedContext();
        setCurrentRole(member.role ?? null);
        setHasPermission(true);
      } catch {
        setHasPermission(false);
      } finally {
        setIsCheckingPermission(false);
      }
    }

    void checkPermission();
  }, []);

  const previewRows = useMemo(() => {
    if (!importPayload) {
      return [];
    }

    return exportTableNames.map((tableName) => ({
      tableName,
      label: tableLabels[tableName],
      count: importPayload.tables[tableName]?.length ?? 0,
    }));
  }, [importPayload]);

  async function handleExportJson() {
    try {
      setIsExporting(true);
      setMessage('');
      setErrorMessage('');
      const { supabase, user, member } = await getAuthorizedContext();
      const storeId = member.store_id;
      const tables = emptyTables();

      const settingsResult = await supabase
        .from<ExportRow>('line_settings')
        .select(safeLineSettingsColumns)
        .eq('store_id', storeId);
      tables.line_settings = settingsResult.data ?? [];

      const tableResults = await Promise.all(
        exportTableNames
          .filter((tableName) => tableName !== 'line_settings')
          .map(async (tableName) => {
            const { data, error } = await supabase
              .from<ExportRow>(tableName)
              .select('*')
              .eq('store_id', storeId);

            if (error) {
              throw new Error(`${tableLabels[tableName]}の取得に失敗しました: ${error.message}`);
            }

            return [tableName, data ?? []] as const;
          })
      );

      tableResults.forEach(([tableName, rows]) => {
        tables[tableName] = rows;
      });

      const { data: storeSettings } = await supabase
        .from<StoreDocumentSettings>('stores')
        .select('quote_note, invoice_note, document_primary_color, document_footer_text')
        .eq('id', storeId)
        .single();

      const payload: ExportPayload = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        app: 'GARAGE_LINK',
        type: 'store_settings_template',
        tables,
        storeDocumentSettings: storeSettings ?? null,
      };

      downloadJson(payload);
      await logAudit({
        supabase,
        storeId,
        userId: user.id,
        userEmail: user.email ?? member.email ?? null,
        userRole: member.role,
        userDisplayName: member.display_name ?? null,
        action: 'export_settings',
        targetType: 'settings',
        targetLabel: '設定エクスポート',
        metadata: {
          exported_tables: exportTableNames,
          exported_at: payload.exportedAt,
        },
      });
      setMessage('設定テンプレートJSONをダウンロードしました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'エクスポートに失敗しました。');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setMessage('');
      setErrorMessage('');
      const text = await file.text();
      const parsed = validateImportPayload(JSON.parse(text));
      setImportPayload(parsed);
      setMessage('JSONを読み込みました。内容を確認してインポートしてください。');
    } catch (error) {
      setImportPayload(null);
      setErrorMessage(error instanceof Error ? error.message : 'JSONの読み込みに失敗しました。');
    }
  }

  async function handleImport() {
    if (!importPayload) {
      setErrorMessage('インポートするJSONを選択してください。');
      return;
    }

    try {
      setIsImporting(true);
      setMessage('');
      setErrorMessage('');
      const { supabase, user, member } = await getAuthorizedContext();
      const storeId = member.store_id;
      const timestamp = Date.now();
      const stepIdMap = new Map<string, string>();
      const formIdMap = new Map<string, string>();

      if (selectedTargets.line_settings && importPayload.tables.line_settings.length > 0) {
        const settingsRows = importPayload.tables.line_settings.map((row) => ({
          ...omitImportManagedColumns(row),
          store_id: storeId,
          connection_status: 'not_connected',
        }));

        const { error } = await supabase
          .from<ExportRow>('line_settings')
          .upsert(settingsRows, { onConflict: 'store_id' });

        if (error) throw new Error(`LINE設定のインポートに失敗しました: ${error.message}`);
      }

      if (selectedTargets.line_tags) {
        const { data: existingTags } = await supabase.from<ExportRow>('line_tags').select('name').eq('store_id', storeId);
        const usedNames = new Set((existingTags ?? []).map((row) => String(row.name ?? '')));
        const rows = importPayload.tables.line_tags.map((row) => ({
          ...omitImportManagedColumns(row),
          store_id: storeId,
          name: appendCopyName(row.name, usedNames),
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_tags').insert(rows);
          if (error) throw new Error(`タグのインポートに失敗しました: ${error.message}`);
        }
      }

      if (selectedTargets.line_templates) {
        const { data: existingTemplates } = await supabase.from<ExportRow>('line_templates').select('name').eq('store_id', storeId);
        const usedNames = new Set((existingTemplates ?? []).map((row) => String(row.name ?? '')));
        const rows = importPayload.tables.line_templates.map((row) => ({
          ...omitImportManagedColumns(row),
          store_id: storeId,
          name: appendCopyName(row.name, usedNames),
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_templates').insert(rows);
          if (error) throw new Error(`テンプレートのインポートに失敗しました: ${error.message}`);
        }
      }

      if (selectedTargets.line_campaigns) {
        const rows = importPayload.tables.line_campaigns.map((row) => ({
          ...omitImportManagedColumns(row),
          store_id: storeId,
          status: row.status === 'sent' ? 'draft' : row.status,
          sent_at: null,
          sent_count: 0,
          failed_count: 0,
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_campaigns').insert(rows);
          if (error) throw new Error(`一斉配信のインポートに失敗しました: ${error.message}`);
        }
      }

      if (selectedTargets.line_steps) {
        for (const row of importPayload.tables.line_steps) {
          const oldId = String(row.id ?? '');
          const { data, error } = await supabase
            .from<ExportRow>('line_steps')
            .insert({ ...omitImportManagedColumns(row), store_id: storeId, status: row.status === 'active' ? 'draft' : row.status, is_active: false })
            .select('id')
            .single();

          if (error || !data?.id) throw new Error(`シナリオ配信のインポートに失敗しました: ${error?.message ?? ''}`);
          if (oldId) stepIdMap.set(oldId, String(data.id));
        }

        const messageRows: ExportRow[] = importPayload.tables.line_step_messages
          .map<ExportRow | null>((row) => {
            const newStepId = stepIdMap.get(String(row.step_id ?? ''));
            if (!newStepId) return null;
            return { ...omitImportManagedColumns(row), store_id: storeId, step_id: newStepId };
          })
          .filter((row): row is ExportRow => row !== null);

        if (messageRows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_step_messages').insert(messageRows);
          if (error) throw new Error(`ステップメッセージのインポートに失敗しました: ${error.message}`);
        }
      }

      if (selectedTargets.line_forms) {
        const { data: existingForms } = await supabase.from<ExportRow>('line_forms').select('public_slug').eq('store_id', storeId);
        const usedSlugs = new Set((existingForms ?? []).map((row) => String(row.public_slug ?? '')).filter(Boolean));

        for (const row of importPayload.tables.line_forms) {
          const oldId = String(row.id ?? '');
          const sanitizedRow = {
            ...omitImportManagedColumns(row),
            store_id: storeId,
            public_slug: row.public_slug ? appendCopyCode(row.public_slug, usedSlugs) : null,
          };
          const { data, error } = await supabase.from<ExportRow>('line_forms').insert(sanitizedRow).select('id').single();

          if (error || !data?.id) throw new Error(`回答フォームのインポートに失敗しました: ${error?.message ?? ''}`);
          if (oldId) formIdMap.set(oldId, String(data.id));
        }

        const questionRows: ExportRow[] = importPayload.tables.line_form_questions
          .map<ExportRow | null>((row) => {
            const newFormId = formIdMap.get(String(row.form_id ?? ''));
            if (!newFormId) return null;
            return { ...omitImportManagedColumns(row), store_id: storeId, form_id: newFormId };
          })
          .filter((row): row is ExportRow => row !== null);

        if (questionRows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_form_questions').insert(questionRows);
          if (error) throw new Error(`フォーム質問のインポートに失敗しました: ${error.message}`);
        }
      }

      if (selectedTargets.line_rich_menus) {
        const rows = importPayload.tables.line_rich_menus.map((row) => ({
          ...omitImportManagedColumns(row),
          store_id: storeId,
          status: 'draft',
          selected: false,
          line_rich_menu_id: null,
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_rich_menus').insert(rows);
          if (error) throw new Error(`リッチメニューのインポートに失敗しました: ${error.message}`);
        }
      }

      if (selectedTargets.line_auto_replies) {
        const rows = importPayload.tables.line_auto_replies.map((row) => ({
          ...omitImportManagedColumns(row),
          store_id: storeId,
          is_active: false,
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_auto_replies').insert(rows);
          if (error) throw new Error(`自動応答のインポートに失敗しました: ${error.message}`);
        }
      }

      if (selectedTargets.line_routes) {
        const { data: existingRoutes } = await supabase.from<ExportRow>('line_routes').select('route_code').eq('store_id', storeId);
        const usedCodes = new Set((existingRoutes ?? []).map((row) => String(row.route_code ?? '')).filter(Boolean));
        const rows = importPayload.tables.line_routes.map((row) => ({
          ...omitImportManagedColumns(row),
          store_id: storeId,
          route_code: appendCopyCode(row.route_code, usedCodes),
          linked_step_id: row.linked_step_id ? stepIdMap.get(String(row.linked_step_id)) ?? null : null,
          friend_count: 0,
          is_active: false,
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from<ExportRow>('line_routes').insert(rows);
          if (error) throw new Error(`流入経路のインポートに失敗しました: ${error.message}`);
        }
      }

      if (importPayload.storeDocumentSettings) {
        const { error } = await supabase
          .from<ExportRow>('stores')
          .update(importPayload.storeDocumentSettings)
          .eq('id', storeId);

        if (error) throw new Error(`帳票共通設定の反映に失敗しました: ${error.message}`);
      }

      setMessage(`追加インポートが完了しました。処理時刻: ${timestamp}`);
      await logAudit({
        supabase,
        storeId,
        userId: user.id,
        userEmail: user.email ?? member.email ?? null,
        userRole: member.role,
        userDisplayName: member.display_name ?? null,
        action: 'import_settings',
        targetType: 'settings',
        targetLabel: '設定インポート',
        metadata: {
          selected_targets: selectedTargets,
          imported_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'インポートに失敗しました。');
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCsvExport() {
    const target = csvExportTargets.find((item) => item.key === csvExportTarget);
    if (!target) return;

    try {
      setIsCsvExporting(true);
      setMessage('');
      setErrorMessage('');

      const response = await fetch(target.endpoint, { method: 'GET' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? 'CSV出力に失敗しました。');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${target.key}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`${target.label}CSVをダウンロードしました。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'CSV出力に失敗しました。');
    } finally {
      setIsCsvExporting(false);
    }
  }

  function resetCsvPreview() {
    setCsvRows([]);
    setCsvPreviewRows([]);
    setCsvPreviewToken('');
    setCsvPreviewCount(0);
    setCsvConfirmChecked(false);
  }

  async function handleCsvPreview() {
    const target = csvImportTargets.find((item) => item.key === csvImportTarget);
    if (!target || !csvFile) {
      setErrorMessage('CSVファイルを選択してください。');
      return;
    }

    try {
      setIsCsvPreviewing(true);
      setMessage('');
      setErrorMessage('');
      resetCsvPreview();

      const content = await csvFile.text();
      const response = await fetch(target.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          fileName: csvFile.name,
          mimeType: csvFile.type,
          content,
        }),
      });
      const payload = await response.json() as CsvPreviewResponse;

      if (!response.ok || !payload.ok || !payload.previewToken || !payload.rows) {
        throw new Error(payload.error ?? 'CSVプレビューに失敗しました。');
      }

      setCsvRows(payload.rows);
      setCsvPreviewRows(payload.previewRows ?? []);
      setCsvPreviewToken(payload.previewToken);
      setCsvPreviewCount(payload.rowCount ?? payload.rows.length);
      setMessage('CSVプレビューを作成しました。内容を確認してから取り込みを確定してください。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'CSVプレビューに失敗しました。');
    } finally {
      setIsCsvPreviewing(false);
    }
  }

  async function handleCsvCommit() {
    const target = csvImportTargets.find((item) => item.key === csvImportTarget);
    if (!target || !csvPreviewToken || csvRows.length === 0) {
      setErrorMessage('先にCSVプレビューを実行してください。');
      return;
    }

    if (!csvConfirmChecked) {
      setErrorMessage('確認チェックを入れてから取り込みを確定してください。');
      return;
    }

    try {
      setIsCsvCommitting(true);
      setMessage('');
      setErrorMessage('');

      const response = await fetch(target.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          rows: csvRows,
          previewToken: csvPreviewToken,
        }),
      });
      const payload = await response.json() as { ok: boolean; insertedCount?: number; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'CSV取り込みに失敗しました。');
      }

      setCsvFile(null);
      resetCsvPreview();
      setMessage(`${target.label}CSVを${payload.insertedCount ?? 0}件取り込みました。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'CSV取り込みに失敗しました。');
    } finally {
      setIsCsvCommitting(false);
    }
  }

  return (
    <AppShell
      activeLabel="車両管理設定"
      title="設定エクスポート / インポート"
      description="他店舗・他会社へ設定を移行し、初期構築工数を削減します。顧客情報や商談情報などの個人情報は含めません。"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      {isCheckingPermission ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
          権限を確認しています...
        </section>
      ) : !hasPermission ? (
        <PermissionDeniedCard />
      ) : (
      <div className="space-y-6">
        {(message || errorMessage) && (
          <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${errorMessage ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
            {errorMessage || message}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-950">エクスポート</h3>
              <p className="mt-1 text-sm text-slate-500">LINE運用設定をJSONテンプレートとしてダウンロードします。</p>
            </div>
            <button
              type="button"
              onClick={() => void handleExportJson()}
              disabled={isExporting}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? 'エクスポート中...' : '設定をJSONでエクスポート'}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exportTableNames.map((tableName) => (
              <div key={tableName} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {tableLabels[tableName]}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-red-600">
            顧客情報、車両情報、商談情報、送信ログ、Webhookイベント、LINE APIキー類は含まれません。
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-bold text-slate-950">インポート</h3>
          <p className="mt-1 text-sm text-slate-500">現在の店舗に設定を追加します。既存データは削除されません。</p>

          <div className="mt-5">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">JSONファイル選択</span>
              <input type="file" accept="application/json,.json" onChange={(event) => void handleFileChange(event)} className={`${inputClass} mt-2`} />
            </label>
          </div>

          {importPayload && (
            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="font-bold text-slate-950">インポート内容プレビュー</h4>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-white text-xs font-bold text-slate-500">
                      <tr>
                        <th className="px-4 py-3">対象</th>
                        <th className="px-4 py-3">件数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {previewRows.map((row) => (
                        <tr key={row.tableName}>
                          <td className="px-4 py-3 font-semibold text-slate-700">{row.label}</td>
                          <td className="px-4 py-3">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="font-bold text-slate-950">インポート対象</h4>
                <div className="mt-4 space-y-3">
                  {importTargets.map((target) => (
                    <label key={target.key} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                      <span>
                        {target.label}
                        <span className="ml-2 text-xs text-slate-400">{countTargetRows(importPayload, target.key)}件</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedTargets[target.key]}
                        onChange={(event) =>
                          setSelectedTargets((current) => ({ ...current, [target.key]: event.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={isImporting}
                  className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImporting ? 'インポート中...' : '選択した設定をインポート'}
                </button>
                <p className="mt-3 text-xs font-semibold text-slate-500">上書きインポートは後日対応です。</p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-600">個人情報を含むCSV操作</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">CSV import / export</h3>
              <p className="mt-1 text-sm text-slate-500">
                顧客情報や車両情報のCSV操作は店舗オーナー・管理者のみ利用できます。操作履歴は監査ログとCSVログに記録されます。
              </p>
            </div>
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${hasCsvPermission(currentRole) ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {hasCsvPermission(currentRole) ? 'CSV操作可能' : 'owner/adminのみ'}
            </span>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            CSV本文、顧客名、電話番号、住所、メールアドレス、LINE userId、フォーム回答全文はログに保存しません。
            LINE友だちのエクスポートはL-LINK側で行います。
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-bold text-slate-950">CSV export</h4>
              <p className="mt-1 text-sm text-slate-500">対象件数はAPI側で確認し、大量出力は拒否または記録します。</p>
              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-700">出力対象</span>
                <select
                  value={csvExportTarget}
                  onChange={(event) => setCsvExportTarget(event.target.value as CsvTargetKey)}
                  className={`${inputClass} mt-2`}
                  disabled={!hasCsvPermission(currentRole) || isCsvExporting}
                >
                  {csvExportTargets.map((target) => (
                    <option key={target.key} value={target.key}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-200">
                {csvExportTargets.find((target) => target.key === csvExportTarget)?.description}
              </div>
              <button
                type="button"
                onClick={() => void handleCsvExport()}
                disabled={!hasCsvPermission(currentRole) || isCsvExporting}
                className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCsvExporting ? 'CSV出力中...' : 'CSVを出力する'}
              </button>
              {!hasCsvPermission(currentRole) && (
                <p className="mt-3 text-xs font-semibold text-slate-500">現在の権限ではCSV exportを実行できません。</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-bold text-slate-950">CSV import</h4>
              <p className="mt-1 text-sm text-slate-500">previewで検証してから、確認チェック後にDBへ保存します。</p>

              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-700">取り込み対象</span>
                <select
                  value={csvImportTarget}
                  onChange={(event) => {
                    setCsvImportTarget(event.target.value as CsvImportTargetKey);
                    resetCsvPreview();
                  }}
                  className={`${inputClass} mt-2`}
                  disabled={!hasCsvPermission(currentRole) || isCsvPreviewing || isCsvCommitting}
                >
                  {csvImportTargets.map((target) => (
                    <option key={target.key} value={target.key}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-bold text-slate-700">CSVファイル</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setCsvFile(event.target.files?.[0] ?? null);
                    resetCsvPreview();
                  }}
                  className={`${inputClass} mt-2`}
                  disabled={!hasCsvPermission(currentRole) || isCsvPreviewing || isCsvCommitting}
                />
              </label>

              <button
                type="button"
                onClick={() => void handleCsvPreview()}
                disabled={!hasCsvPermission(currentRole) || !csvFile || isCsvPreviewing || isCsvCommitting}
                className="mt-4 w-full rounded-xl border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCsvPreviewing ? 'プレビュー作成中...' : 'CSVをプレビュー'}
              </button>

              {csvPreviewToken && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="font-bold text-slate-950">プレビュー結果</h5>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{csvPreviewCount}件</span>
                  </div>
                  <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="bg-slate-50 font-bold text-slate-500">
                        <tr>
                          {Object.keys(csvPreviewRows[0] ?? {}).map((header) => (
                            <th key={header} className="px-3 py-2">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {csvPreviewRows.map((row, index) => (
                          <tr key={`${index}-${Object.values(row).join('-')}`}>
                            {Object.keys(csvPreviewRows[0] ?? {}).map((header) => (
                              <td key={header} className="max-w-[220px] truncate px-3 py-2 text-slate-600">{row[header] || '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
                    <input
                      type="checkbox"
                      checked={csvConfirmChecked}
                      onChange={(event) => setCsvConfirmChecked(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-amber-300"
                    />
                    <span>プレビュー内容と取り込み対象を確認しました。tenant_id / store_id はCSV値ではなくサーバー側の所属店舗で保存されます。</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleCsvCommit()}
                    disabled={!csvConfirmChecked || isCsvCommitting}
                    className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCsvCommitting ? '取り込み中...' : 'CSV取り込みを確定する'}
                  </button>
                </div>
              )}

              {!hasCsvPermission(currentRole) && (
                <p className="mt-3 text-xs font-semibold text-slate-500">現在の権限ではCSV importを実行できません。</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">移行対象</h3>
            <p className="mt-1 text-sm text-slate-500">店舗固有情報や個人情報は移行対象外です。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">対象</th>
                  <th className="px-5 py-4">含まれる</th>
                  <th className="px-5 py-4">含まれない</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-5 py-4 font-bold">LINE運用設定</td>
                  <td className="px-5 py-4">LINE設定、タグ、テンプレート、シナリオ、フォーム、リッチメニュー、自動応答、流入経路</td>
                  <td className="px-5 py-4">Channel ID、Channel Secret、Channel Access Token</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 font-bold">帳票共通設定</td>
                  <td className="px-5 py-4">見積備考、請求備考、帳票カラー、フッター文</td>
                  <td className="px-5 py-4">会社名、住所、電話番号、銀行口座、ロゴ、角印</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 font-bold">実績・個人情報</td>
                  <td className="px-5 py-4">含めません</td>
                  <td className="px-5 py-4">顧客、車両、商談、見積、請求、LINE友だち、送信ログ、Webhookイベント、フォーム回答</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
      )}
    </AppShell>
  );
}
