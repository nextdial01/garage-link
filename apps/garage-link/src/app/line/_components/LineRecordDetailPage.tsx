'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LineModuleShell, StatusBadge, inputClass } from './LineModule';
import { createClient } from '@/lib/supabase/client';
import { logAudit } from '@/lib/audit/logAudit';
import type { LineCrudField, LineCrudRow } from './LineCrudPage';
import LineStepEditorLayout, { type LineEditorStep } from '@/components/line/LineStepEditorLayout';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type RelatedRow = {
  id: string;
  title?: string | null;
  body?: string | null;
  label?: string | null;
  message_order?: number | null;
  question_order?: number | null;
  field_type?: string | null;
  delay_amount?: number | null;
  delay_unit?: string | null;
};

type LineRecordDetailPageProps = {
  title: string;
  description: string;
  tableName: string;
  listPath: string;
  fields: LineCrudField[];
  nameKey: string;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '-';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function getRecordLabel(row: LineCrudRow | null, nameKey: string) {
  if (!row) {
    return '-';
  }

  return displayValue(row[nameKey] ?? row.name ?? row.title ?? row.label ?? row.id);
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

function parsePayload(fields: LineCrudField[], formData: Record<string, string>) {
  const payload: Record<string, unknown> = {};

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
      payload[field.name] = value.split(',').map((tag) => tag.trim()).filter(Boolean);
    } else if (field.type === 'json') {
      payload[field.name] = parseJsonInput(value);
    } else {
      payload[field.name] = value || null;
    }
  });

  return payload;
}

function rowToFormData(fields: LineCrudField[], row: LineCrudRow | null) {
  return fields.reduce<Record<string, string>>((result, field) => {
    const value = row?.[field.name];

    if (field.type === 'boolean') {
      result[field.name] = value === true ? 'true' : 'false';
    } else if (field.type === 'tags' && Array.isArray(value)) {
      result[field.name] = value.join(', ');
    } else if (field.type === 'json') {
      result[field.name] = value ? JSON.stringify(value, null, 2) : '';
    } else {
      result[field.name] = value === null || value === undefined ? field.defaultValue ?? '' : String(value);
    }

    return result;
  }, {});
}

function getEditorSteps(tableName: string): LineEditorStep[] {
  if (tableName === 'line_rich_menus') {
    return [
      { id: 'image', label: '画像設定', description: 'メニュー画像と表示状態を設定' },
      { id: 'area', label: 'タップエリア', description: 'レイアウトとエリアJSONを編集' },
      { id: 'action', label: 'タップ時アクション', description: 'LINE側IDや導線を確認' },
      { id: 'detail', label: '詳細設定', description: '社内メモや補足を管理' },
    ];
  }

  if (tableName === 'line_forms') {
    return [
      { id: 'basic', label: '基本設定', description: 'フォーム名、種別、公開状態' },
      { id: 'questions', label: '質問項目', description: '質問一覧を確認' },
      { id: 'thanks', label: '完了時アクション', description: '送信後の案内文を編集' },
      { id: 'detail', label: '公開設定', description: 'タグ、slug、社内メモ' },
    ];
  }

  if (tableName === 'line_steps') {
    return [
      { id: 'basic', label: '基本設定', description: 'シナリオ名と概要' },
      { id: 'trigger', label: '開始条件', description: 'トリガーと稼働状態' },
      { id: 'messages', label: 'メッセージ設定', description: '時系列の配信内容' },
      { id: 'detail', label: '停止条件・公開設定', description: 'メモと停止条件' },
    ];
  }

  if (tableName === 'line_campaigns') {
    return [
      { id: 'basic', label: '基本設定', description: '配信名とステータス' },
      { id: 'target', label: '配信対象', description: 'タグ条件と対象人数' },
      { id: 'message', label: 'メッセージ作成', description: '本文と配信種別' },
      { id: 'schedule', label: '配信予約・確認', description: '送信予定とメモ' },
    ];
  }

  return [
    { id: 'basic', label: '基本設定', description: '管理名と主要項目' },
    { id: 'content', label: '内容設定', description: '本文や説明を編集' },
    { id: 'detail', label: '詳細設定', description: '状態とメモを確認' },
  ];
}

function getFieldStep(tableName: string, fieldName: string) {
  if (tableName === 'line_rich_menus') {
    if (['name', 'status', 'image_path', 'selected'].includes(fieldName)) return 'image';
    if (['layout_type', 'areas'].includes(fieldName)) return 'area';
    if (['chat_bar_text', 'line_rich_menu_id'].includes(fieldName)) return 'action';
    return 'detail';
  }

  if (tableName === 'line_forms') {
    if (['name', 'form_type', 'status', 'description'].includes(fieldName)) return 'basic';
    if (fieldName === 'thanks_message' || fieldName === 'submit_button_label') return 'thanks';
    if (['public_slug', 'linked_tags', 'internal_memo'].includes(fieldName)) return 'detail';
    return 'questions';
  }

  if (tableName === 'line_steps') {
    if (['name', 'description'].includes(fieldName)) return 'basic';
    if (['trigger_type', 'status', 'is_active'].includes(fieldName)) return 'trigger';
    if (fieldName === 'internal_memo') return 'detail';
    return 'messages';
  }

  if (tableName === 'line_campaigns') {
    if (['title', 'status', 'created_by'].includes(fieldName)) return 'basic';
    if (['target_type', 'target_tags', 'exclude_tags', 'target_count'].includes(fieldName)) return 'target';
    if (['message_type', 'body'].includes(fieldName)) return 'message';
    return 'schedule';
  }

  if (['body', 'response_body', 'description'].includes(fieldName)) return 'content';
  if (['internal_memo', 'is_active', 'status'].includes(fieldName)) return 'detail';
  return 'basic';
}

export default function LineRecordDetailPage({
  title,
  description,
  tableName,
  listPath,
  fields,
  nameKey,
}: LineRecordDetailPageProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const recordId = params.id;
  const [storeId, setStoreId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string | null>(null);
  const [record, setRecord] = useState<LineCrudRow | null>(null);
  const [relatedRows, setRelatedRows] = useState<RelatedRow[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>(() => rowToFormData(fields, null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const steps = useMemo(() => getEditorSteps(tableName), [tableName]);
  const [activeStep, setActiveStep] = useState(steps[0]?.id ?? 'basic');

  useEffect(() => {
    async function loadRecord() {
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
          .eq('id', recordId)
          .eq('store_id', member.store_id)
          .single();

        if (error || !data) {
          throw new Error(error?.message ?? 'データが見つかりません。');
        }

        if (data.deleted_at || data.is_archived === true) {
          throw new Error('このデータはアーカイブされています。');
        }

        setRecord(data);
        setFormData(rowToFormData(fields, data));

        if (tableName === 'line_steps') {
          const { data: messages } = await supabase
            .from<RelatedRow>('line_step_messages')
            .select('id, title, body, message_order, delay_amount, delay_unit')
            .eq('store_id', member.store_id)
            .eq('step_id', recordId)
            .order('message_order', { ascending: true });
          setRelatedRows(messages ?? []);
        } else if (tableName === 'line_forms') {
          const { data: questions } = await supabase
            .from<RelatedRow>('line_form_questions')
            .select('id, label, field_type, question_order')
            .eq('store_id', member.store_id)
            .eq('form_id', recordId)
            .order('question_order', { ascending: true });
          setRelatedRows(questions ?? []);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '詳細の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadRecord();
  }, [fields, recordId, tableName]);

  function updateField(name: string, value: string) {
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function saveRecord(shouldGoBack = false) {
    if (!storeId) {
      setErrorMessage('所属店舗を取得できていません。');
      return;
    }

    try {
      setIsSaving(true);
      setMessage('');
      setErrorMessage('');
      const supabase = createClient();
      const { error } = await supabase
        .from<LineCrudRow>(tableName)
        .update(parsePayload(fields, formData))
        .eq('id', recordId)
        .eq('store_id', storeId);

      if (error) {
        throw new Error(error.message);
      }

      setMessage('保存しました。');
      if (shouldGoBack) {
        router.push(listPath);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  function moveStep(direction: 'next' | 'back') {
    const currentIndex = steps.findIndex((step) => step.id === activeStep);
    const nextIndex = direction === 'next'
      ? Math.min(steps.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    setActiveStep(steps[nextIndex]?.id ?? activeStep);
  }

  async function handleDelete() {
    if (!storeId) {
      return;
    }

    const confirmed = window.confirm('削除すると一覧から非表示になり、ゴミ箱 / アーカイブから復元できます。削除してもよろしいですか？');
    if (!confirmed) {
      return;
    }

    try {
      setIsSaving(true);
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
        .eq('id', recordId)
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
        targetId: recordId,
        targetLabel: getRecordLabel(record, nameKey),
        beforeData: record,
        afterData: archivePayload,
        metadata: { soft_delete: true, table_name: tableName },
      });

      router.push(listPath);
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
        <Link href={listPath} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50">
          一覧に戻る
        </Link>
      }
    >
      {(message || errorMessage) && (
        <div className={`mb-5 rounded-2xl border px-5 py-4 text-sm font-semibold ${errorMessage ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {errorMessage || message}
        </div>
      )}

      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">読み込み中...</section>
      ) : (
        <LineStepEditorLayout
          breadcrumb={`TOP > ${title}`}
          title={title}
          managementName={displayValue(record?.[nameKey])}
          folderName="未分類"
          steps={steps}
          activeStep={activeStep}
          onStepChange={setActiveStep}
          onNext={() => moveStep('next')}
          onBack={() => moveStep('back')}
          onSave={() => void saveRecord(false)}
          onSaveAndBack={() => void saveRecord(true)}
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <StatusBadge value={displayValue(record?.status ?? record?.is_active ?? '詳細')} />
                <span className="text-sm font-semibold text-slate-500">管理ID: {recordId}</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {fields
                  .filter((field) => field.persist !== false)
                  .filter((field) => getFieldStep(tableName, field.name) === activeStep)
                  .map((field) => (
                    <label key={field.name} className={field.type === 'textarea' || field.type === 'json' ? 'md:col-span-2' : ''}>
                  <span className="text-sm font-bold text-slate-700">{field.label}</span>
                  {field.type === 'textarea' || field.type === 'json' ? (
                    <textarea
                      className={`${inputClass} mt-2 min-h-28`}
                      value={formData[field.name] ?? ''}
                      onChange={(event) => updateField(field.name, event.target.value)}
                    />
                  ) : field.type === 'select' || field.type === 'boolean' ? (
                    <select
                      className={`${inputClass} mt-2`}
                      value={formData[field.name] ?? ''}
                      onChange={(event) => updateField(field.name, event.target.value)}
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
                      type={field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text'}
                      value={formData[field.name] ?? ''}
                      onChange={(event) => updateField(field.name, event.target.value)}
                    />
                  )}
                    </label>
                  ))}

                {fields.filter((field) => field.persist !== false).filter((field) => getFieldStep(tableName, field.name) === activeStep).length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500 md:col-span-2">
                    このSTEPで編集する基本項目はありません。右側の関連情報を確認してください。
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-base font-bold text-slate-950">プレビュー</h3>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-bold text-slate-950">{displayValue(record?.[nameKey])}</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {displayValue(formData.body ?? formData.response_body ?? formData.description ?? formData.thanks_message)}
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-base font-bold text-slate-950">保存状態</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">作成日</dt>
                  <dd className="font-semibold text-slate-700">{displayValue(record?.created_at)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">最終編集日</dt>
                  <dd className="font-semibold text-slate-700">{displayValue(record?.updated_at)}</dd>
                </div>
              </dl>
              <button type="button" onClick={() => void handleDelete()} disabled={isSaving} className="mt-5 w-full rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-60">
                削除
              </button>
            </section>

            {relatedRows.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-base font-bold text-slate-950">
                  {tableName === 'line_steps' ? 'ステップメッセージ' : '質問項目'}
                </h3>
                <div className="mt-4 space-y-3">
                  {relatedRows.map((row) => (
                    <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                      <p className="font-bold text-slate-800">{displayValue(row.title ?? row.label)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        順序: {displayValue(row.message_order ?? row.question_order)}
                        {row.delay_amount !== undefined && ` / 遅延: ${displayValue(row.delay_amount)} ${displayValue(row.delay_unit)}`}
                      </p>
                      {row.body && <p className="mt-2 whitespace-pre-wrap text-slate-600">{row.body}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}
            </aside>
          </div>
        </LineStepEditorLayout>
      )}
    </LineModuleShell>
  );
}
