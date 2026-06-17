'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LineManagementLayout from '@/components/LineManagementLayout';
import {
  LineModuleShell,
  StatCards,
  StatusBadge,
  inputClass,
  type StatItem,
} from './LineModule';
import { logAudit } from '@/lib/audit/logAudit';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

export type LineCrudRow = Record<string, unknown> & {
  id: string;
  store_id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  is_archived?: boolean | null;
};

export type LineCrudField = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'color' | 'number' | 'datetime-local' | 'tags' | 'json' | 'boolean';
  options?: { label: string; value: string }[];
  placeholder?: string;
  helper?: string;
  required?: boolean;
  fullWidth?: boolean;
  defaultValue?: string;
  persist?: boolean;
};

export type LineCrudColumn = {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'datetime' | 'number' | 'boolean' | 'status' | 'tags' | 'color' | 'json';
};

type SupabaseClient = ReturnType<typeof createClient>;

type LineCrudPageProps = {
  title: string;
  description: string;
  tableName: string;
  formTitle: string;
  tableTitle: string;
  emptyMessage: string;
  fields: LineCrudField[];
  columns: LineCrudColumn[];
  searchKeys?: string[];
  statsBuilder?: (rows: LineCrudRow[]) => StatItem[];
  submitLabel?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  showCsvButton?: boolean;
  sortLabel?: string;
  detailBasePath?: string;
  categories?: string[];
  helperText?: string;
  preview?: (formData: Record<string, string>) => ReactNode;
  afterCreate?: (
    supabase: SupabaseClient,
    createdRow: LineCrudRow,
    storeId: string,
    formData: Record<string, string>
  ) => Promise<void>;
};

const defaultStats = (rows: LineCrudRow[]): StatItem[] => [
  { label: '登録数', value: String(rows.length) },
  { label: '有効', value: String(rows.filter((row) => row.is_active === true || row.status === 'active' || row.status === 'published').length) },
  { label: '下書き', value: String(rows.filter((row) => row.status === 'draft').length) },
  { label: '今月更新', value: String(rows.filter((row) => isThisMonth(row.updated_at ?? row.created_at)).length) },
];

function isThisMonth(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function initialFormData(fields: LineCrudField[]) {
  return fields.reduce<Record<string, string>>((result, field) => {
    result[field.name] = field.defaultValue ?? '';
    return result;
  }, {});
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function getRowLabel(row: LineCrudRow) {
  const label =
    row.name ??
    row.title ??
    row.label ??
    row.route_name ??
    row.template_name ??
    row.campaign_name ??
    row.id;
  return displayValue(label);
}

function getLineAuditTargetType(tableName: string) {
  const targetTypes: Record<string, Parameters<typeof logAudit>[0]['targetType']> = {
    line_tags: 'line_tag',
    line_templates: 'line_template',
    line_campaigns: 'line_campaign',
    line_steps: 'line_step',
    line_forms: 'line_form',
    line_rich_menus: 'line_rich_menu',
    line_auto_replies: 'line_auto_reply',
    line_routes: 'line_route',
  };

  return targetTypes[tableName] ?? 'settings';
}

function formatDateTime(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return '-';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return '-';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function parseJsonInput(value: string) {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function parsePayload(fields: LineCrudField[], formData: Record<string, string>, storeId: string) {
  const payload: Record<string, unknown> = { store_id: storeId };

  fields.forEach((field) => {
    if (field.persist === false) {
      return;
    }

    const value = formData[field.name] ?? '';

    if (field.type === 'number') {
      payload[field.name] = value === '' ? null : Number(value);
    } else if (field.type === 'boolean') {
      payload[field.name] = value === 'true';
    } else if (field.type === 'tags') {
      payload[field.name] = value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    } else if (field.type === 'json') {
      payload[field.name] = parseJsonInput(value);
    } else if (field.type === 'datetime-local') {
      payload[field.name] = value || null;
    } else {
      payload[field.name] = value || null;
    }
  });

  return payload;
}

function rowToFormData(fields: LineCrudField[], row: LineCrudRow) {
  return fields.reduce<Record<string, string>>((result, field) => {
    const value = row[field.name];

    if (field.type === 'boolean') {
      result[field.name] = value === true ? 'true' : 'false';
    } else if (field.type === 'tags' && Array.isArray(value)) {
      result[field.name] = value.join(', ');
    } else if (field.type === 'json') {
      result[field.name] = value ? JSON.stringify(value, null, 2) : '';
    } else if (field.type === 'datetime-local' && typeof value === 'string') {
      result[field.name] = value.slice(0, 16);
    } else {
      result[field.name] = value === null || value === undefined ? field.defaultValue ?? '' : String(value);
    }

    return result;
  }, {});
}

function renderCell(row: LineCrudRow, column: LineCrudColumn) {
  const value = row[column.key];

  if (column.type === 'boolean') {
    return <StatusBadge value={value === true ? '有効' : '無効'} />;
  }

  if (column.type === 'status') {
    return <StatusBadge value={displayValue(value)} />;
  }

  if (column.type === 'tags') {
    const tags = Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];

    if (tags.length === 0) {
      return <span className="text-slate-400">-</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span key={tag} className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-100">
            {tag}
          </span>
        ))}
      </div>
    );
  }

  if (column.type === 'color') {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
        <span className="h-4 w-4 rounded-full border border-slate-200" style={{ backgroundColor: typeof value === 'string' ? value : '#2563eb' }} />
        {displayValue(value)}
      </span>
    );
  }

  if (column.type === 'datetime') {
    return <span>{formatDateTime(value)}</span>;
  }

  if (column.type === 'date') {
    return <span>{formatDate(value)}</span>;
  }

  if (column.type === 'number') {
    return <span>{typeof value === 'number' ? value.toLocaleString('ja-JP') : displayValue(value)}</span>;
  }

  if (column.type === 'json') {
    return <span className="line-clamp-2 text-xs text-slate-600">{value ? JSON.stringify(value) : '-'}</span>;
  }

  return <span className="font-medium text-slate-700">{displayValue(value)}</span>;
}

export function LineCrudPage({
  title,
  description,
  tableName,
  formTitle,
  tableTitle,
  emptyMessage,
  fields,
  columns,
  searchKeys = [],
  statsBuilder,
  submitLabel = '保存',
  primaryActionLabel = '新規作成',
  secondaryActionLabel,
  showCsvButton = false,
  sortLabel = '並べ替え',
  detailBasePath,
  categories = ['未分類'],
  helperText,
  preview,
  afterCreate,
}: LineCrudPageProps) {
  const router = useRouter();
  const [storeId, setStoreId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string | null>(null);
  const [rows, setRows] = useState<LineCrudRow[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>(() => initialFormData(fields));
  const [editingId, setEditingId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(categories[0] ?? '未分類');
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadRows() {
      try {
        setIsLoading(true);
        setErrorMessage('');
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

        setStoreId(member.store_id);
        setCurrentUserId(userData.user.id);
        setCurrentUserEmail(member.email ?? userData.user.email ?? null);
        setCurrentUserRole(member.role);
        setCurrentUserDisplayName(member.display_name);

        const { data, error } = await supabase
          .from<LineCrudRow>(tableName)
          .select('*')
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setRows((data ?? []).filter((row) => !row.deleted_at && row.is_archived !== true));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'データの取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadRows();
  }, [tableName, reloadKey]);

  const stats = useMemo(() => (statsBuilder ?? defaultStats)(rows), [rows, statsBuilder]);

  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
      return rows;
    }

    return rows.filter((row) =>
      searchKeys.some((key) => {
        const value = row[key];
        const text = Array.isArray(value) ? value.join(' ') : displayValue(value);
        return text.toLowerCase().includes(normalizedKeyword);
      })
    );
  }, [keyword, rows, searchKeys]);

  function updateField(name: string, value: string) {
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setFormData(initialFormData(fields));
    setEditingId('');
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(row: LineCrudRow) {
    setEditingId(row.id);
    setFormData(rowToFormData(fields, row));
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!storeId) {
      setErrorMessage('所属店舗を取得できていません。');
      return;
    }

    try {
      setIsSaving(true);
      setMessage('');
      setErrorMessage('');
      const supabase = createClient();
      const payload = parsePayload(fields, formData, storeId);

      if (editingId) {
        const { error } = await supabase
          .from<LineCrudRow>(tableName)
          .update(payload)
          .eq('id', editingId)
          .eq('store_id', storeId);

        if (error) {
          throw new Error(error.message);
        }

        setMessage('更新しました。');
      } else {
        const { data, error } = await supabase
          .from<LineCrudRow>(tableName)
          .insert(payload)
          .select('*')
          .single();

        if (error) {
          throw new Error(error.message);
        }

        if (data && afterCreate) {
          await afterCreate(supabase, data, storeId, formData);
        }

        setMessage('保存しました。');
      }

      resetForm();
      setShowForm(false);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(row: LineCrudRow) {
    if (!storeId) {
      return;
    }

    const confirmed = window.confirm('削除すると一覧から非表示になり、ゴミ箱 / アーカイブから復元できます。削除してもよろしいですか？');
    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
      setMessage('');
      setErrorMessage('');
      const supabase = createClient();
      const deletedAt = new Date().toISOString();
      const archivePayload = {
        deleted_at: deletedAt,
        deleted_by: currentUserEmail,
        is_archived: true,
      };
      const { error } = await supabase
        .from<LineCrudRow>(tableName)
        .update(archivePayload)
        .eq('id', row.id)
        .eq('store_id', storeId);

      if (error) {
        throw new Error(error.message);
      }

      await logAudit({
        supabase,
        storeId,
        userId: currentUserId,
        userEmail: currentUserEmail,
        userRole: currentUserRole,
        userDisplayName: currentUserDisplayName,
        action: 'delete',
        targetType: getLineAuditTargetType(tableName),
        targetId: row.id,
        targetLabel: getRowLabel(row),
        beforeData: row,
        afterData: archivePayload,
        metadata: { soft_delete: true, table_name: tableName },
      });

      setMessage('アーカイブしました。ゴミ箱 / アーカイブから復元できます。');
      setReloadKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '削除に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <LineModuleShell
      title={title}
      description={description}
      actionButton={
        <Link
          href="/line"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
        >
          LINE管理へ戻る
        </Link>
      }
    >
      <StatCards stats={stats} />

      {(message || errorMessage) && (
        <div className={`mb-6 rounded-2xl border px-5 py-4 text-sm font-semibold ${errorMessage ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {errorMessage || message}
        </div>
      )}

      <LineManagementLayout
        title={title}
        description={description}
        helpText={helperText}
        categories={categories.map((category, index) => ({
          label: category,
          count: index === 0 ? rows.length : 0,
        }))}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        toolbar={
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-950">{tableTitle}</h3>
              <p className="mt-1 text-sm text-slate-500">保存済みデータを一覧で管理します。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startCreate}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
              >
                {primaryActionLabel}
              </button>
              {showCsvButton && (
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  CSV一括追加
                </button>
              )}
              {secondaryActionLabel && (
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
                >
                  {secondaryActionLabel}
                </button>
              )}
              <button
                type="button"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
              >
                {sortLabel}
              </button>
              <input
                className={`${inputClass} h-10 w-56 py-2`}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="検索"
              />
              <button
                type="button"
                className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-bold text-green-700 shadow-sm transition hover:bg-green-100"
              >
                検索
              </button>
            </div>
          </div>
        }
      >
        {showForm && (
          <section className="border-b border-slate-100 bg-slate-50/60 p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">{editingId ? '編集' : formTitle}</h3>
                <p className="mt-1 text-sm text-slate-500">入力内容は所属店舗のLINE管理データとして保存されます。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
              >
                閉じる
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fields.map((field) => (
                <label key={field.name} className={field.fullWidth || field.type === 'textarea' || field.type === 'json' ? 'md:col-span-2 xl:col-span-3' : ''}>
                  <span className="text-sm font-bold text-slate-700">{field.label}</span>
                  {field.type === 'textarea' || field.type === 'json' ? (
                    <textarea
                      className={`${inputClass} mt-2 min-h-28`}
                      value={formData[field.name] ?? ''}
                      onChange={(event) => updateField(field.name, event.target.value)}
                      placeholder={field.placeholder}
                      required={field.required}
                    />
                  ) : field.type === 'select' || field.type === 'boolean' ? (
                    <select
                      className={`${inputClass} mt-2`}
                      value={formData[field.name] ?? ''}
                      onChange={(event) => updateField(field.name, event.target.value)}
                      required={field.required}
                    >
                      <option value="">選択してください</option>
                      {(field.type === 'boolean'
                        ? [
                            { label: '有効', value: 'true' },
                            { label: '無効', value: 'false' },
                          ]
                        : field.options ?? []
                      ).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={`${inputClass} mt-2`}
                      type={field.type === 'datetime-local' ? 'datetime-local' : field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text'}
                      value={formData[field.name] ?? ''}
                      onChange={(event) => updateField(field.name, event.target.value)}
                      placeholder={field.placeholder}
                      required={field.required}
                    />
                  )}
                  {field.helper && <span className="mt-1 block text-xs text-slate-500">{field.helper}</span>}
                </label>
              ))}

              {preview && <div className="md:col-span-2 xl:col-span-3">{preview(formData)}</div>}

              <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? '保存中...' : editingId ? '更新する' : submitLabel}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
                >
                  クリア
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label="全選択" />
                </th>
                {columns.map((column) => (
                  <th key={column.key} className="px-5 py-4">
                    {column.label}
                  </th>
                ))}
                <th className="px-5 py-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td className="px-5 py-8 text-center text-sm font-semibold text-slate-500" colSpan={columns.length + 2}>
                    読み込み中...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-sm font-semibold text-slate-500" colSpan={columns.length + 2}>
                    <span className="block">{emptyMessage}</span>
                    <button
                      type="button"
                      onClick={startCreate}
                      className="mt-4 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
                    >
                      {primaryActionLabel}
                    </button>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => detailBasePath && router.push(`${detailBasePath}/${row.id}`)}
                    className={`${detailBasePath ? 'cursor-pointer' : ''} hover:bg-green-50/60`}
                  >
                    <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label="選択" />
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} className="px-5 py-4 align-top">
                        {renderCell(row, column)}
                      </td>
                    ))}
                    <td className="px-5 py-4">
                      <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                        {detailBasePath && (
                          <Link
                            href={`${detailBasePath}/${row.id}`}
                            className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 shadow-sm transition hover:bg-green-100"
                          >
                            表示
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-500 shadow-sm transition hover:bg-green-50"
                        >
                          ...
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          disabled={isSaving}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </LineManagementLayout>
    </LineModuleShell>
  );
}
