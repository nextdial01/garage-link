'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';
import { logAudit } from '@/lib/audit/logAudit';
import { getRoleLabel } from '@/lib/auth/permissions';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type TrashRow = Record<string, unknown> & {
  id: string;
  store_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  is_archived?: boolean | null;
  name?: string | null;
  title?: string | null;
  management_no?: string | null;
  deal_no?: string | null;
  quote_no?: string | null;
  invoice_no?: string | null;
  job_no?: string | null;
  count_no?: string | null;
  maker?: string | null;
  model_name?: string | null;
};

type TrashTarget = {
  tableName: string;
  typeLabel: string;
  targetType: Parameters<typeof logAudit>[0]['targetType'];
};

type TrashItem = TrashTarget & {
  id: string;
  label: string;
  deletedAt: string | null;
  deletedBy: string | null;
  raw: TrashRow;
};

const allowedRoles = ['owner', 'admin'];

const trashTargets: TrashTarget[] = [
  { tableName: 'vehicles', typeLabel: '車両', targetType: 'vehicle' },
  { tableName: 'customers', typeLabel: '顧客', targetType: 'customer' },
  { tableName: 'deals', typeLabel: '商談', targetType: 'deal' },
  { tableName: 'maintenance_jobs', typeLabel: '整備・車検', targetType: 'maintenance_job' },
  { tableName: 'inventory_counts', typeLabel: '棚卸し', targetType: 'inventory_count' },
  { tableName: 'line_tags', typeLabel: 'LINEタグ', targetType: 'line_tag' },
  { tableName: 'line_templates', typeLabel: 'テンプレート', targetType: 'line_template' },
  { tableName: 'line_campaigns', typeLabel: '一斉配信', targetType: 'line_campaign' },
  { tableName: 'line_steps', typeLabel: 'ステップ配信', targetType: 'line_step' },
  { tableName: 'line_forms', typeLabel: '回答フォーム', targetType: 'line_form' },
  { tableName: 'line_rich_menus', typeLabel: 'リッチメニュー', targetType: 'line_rich_menu' },
  { tableName: 'line_auto_replies', typeLabel: '自動応答', targetType: 'line_auto_reply' },
  { tableName: 'line_routes', typeLabel: '流入経路', targetType: 'line_route' },
];

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
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

function getRowLabel(row: TrashRow) {
  const vehicleLabel = [row.maker, row.model_name].filter(Boolean).join(' ');
  return displayValue(
    row.management_no ??
      row.deal_no ??
      row.quote_no ??
      row.invoice_no ??
      row.job_no ??
      row.count_no ??
      row.name ??
      row.title ??
      vehicleLabel ??
      row.id
  );
}

function sortTrashItems(items: TrashItem[]) {
  return [...items].sort((a, b) => {
    const first = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const second = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    return second - first;
  });
}

export default function TrashPage() {
  const [storeId, setStoreId] = useState('');
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingId, setIsSavingId] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const canView = allowedRoles.includes(userRole ?? '');
  const canPermanentlyDelete = userRole === 'owner';

  useEffect(() => {
    async function loadTrash() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        setMessage('');
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
        setUserId(userData.user.id);
        setUserEmail(member.email ?? userData.user.email ?? null);
        setUserRole(member.role);
        setUserDisplayName(member.display_name);

        if (!allowedRoles.includes(member.role ?? '')) {
          setItems([]);
          return;
        }

        const rowsByTarget = await Promise.all(
          trashTargets.map(async (target) => {
            const { data, error } = await supabase
              .from<TrashRow>(target.tableName)
              .select('*')
              .eq('store_id', member.store_id)
              .order('deleted_at', { ascending: false });

            if (error) {
              return [];
            }

            return (data ?? [])
              .filter((row) => Boolean(row.deleted_at) || row.is_archived === true)
              .map<TrashItem>((row) => ({
                ...target,
                id: row.id,
                label: getRowLabel(row),
                deletedAt: row.deleted_at ?? null,
                deletedBy: row.deleted_by ?? null,
                raw: row,
              }));
          })
        );

        setItems(sortTrashItems(rowsByTarget.flat()));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'ゴミ箱の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadTrash();
  }, []);

  const stats = useMemo(() => {
    const byType = trashTargets.map((target) => ({
      label: target.typeLabel,
      count: items.filter((item) => item.tableName === target.tableName).length,
    }));
    return byType.filter((item) => item.count > 0);
  }, [items]);

  async function restoreItem(item: TrashItem) {
    if (!storeId || !canView) {
      return;
    }

    const confirmed = window.confirm(`${item.typeLabel}「${item.label}」を復元します。よろしいですか？`);
    if (!confirmed) {
      return;
    }

    try {
      setIsSavingId(item.id);
      setMessage('');
      setErrorMessage('');
      const supabase = createClient();
      const restorePayload = {
        deleted_at: null,
        deleted_by: null,
        is_archived: false,
      };
      const { error } = await supabase
        .from<TrashRow>(item.tableName)
        .update(restorePayload)
        .eq('id', item.id)
        .eq('store_id', storeId);

      if (error) {
        throw new Error(error.message);
      }

      await logAudit({
        supabase,
        storeId,
        userId,
        userEmail,
        userRole,
        userDisplayName,
        action: 'restore',
        targetType: item.targetType,
        targetId: item.id,
        targetLabel: item.label,
        beforeData: item.raw,
        afterData: restorePayload,
        metadata: { restored: true, table_name: item.tableName },
      });

      setItems((current) => current.filter((currentItem) => !(currentItem.tableName === item.tableName && currentItem.id === item.id)));
      setMessage(`${item.typeLabel}「${item.label}」を復元しました。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '復元に失敗しました。');
    } finally {
      setIsSavingId('');
    }
  }

  return (
    <AppShell
      activeLabel="ゴミ箱 / アーカイブ"
      title="ゴミ箱 / アーカイブ"
      description="削除済み・アーカイブ済みのデータを確認し、必要に応じて復元します"
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
          削除済みデータを確認しています...
        </section>
      ) : !canView ? (
        <PermissionDeniedCard />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          {(message || errorMessage) && (
            <div className={`rounded-2xl border px-5 py-4 text-sm font-bold ${errorMessage ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
              {errorMessage || message}
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-500">現在の権限: {getRoleLabel(userRole)}</p>
                <h3 className="mt-2 text-lg font-bold text-slate-950">アーカイブ済みデータ</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  復元すると通常の一覧に戻ります。完全削除は本番運用ルールが固まるまで無効化しています。
                </p>
              </div>
              <Link
                href="/settings"
                className="inline-flex justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                設定に戻る
              </Link>
            </div>
            {stats.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {stats.map((stat) => (
                  <span key={stat.label} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    {stat.label}: {stat.count}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">種別</th>
                    <th className="px-5 py-4">名称</th>
                    <th className="px-5 py-4">削除日時</th>
                    <th className="px-5 py-4">削除者</th>
                    <th className="px-5 py-4">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td className="px-5 py-10 text-center text-sm font-semibold text-slate-500" colSpan={5}>
                        削除済み・アーカイブ済みのデータはありません
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={`${item.tableName}-${item.id}`} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                            {item.typeLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-800">{item.label}</td>
                        <td className="px-5 py-4 text-slate-600">{formatDateTime(item.deletedAt)}</td>
                        <td className="px-5 py-4 text-slate-600">{displayValue(item.deletedBy)}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void restoreItem(item)}
                              disabled={isSavingId === item.id}
                              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSavingId === item.id ? '復元中...' : '復元'}
                            </button>
                            <button
                              type="button"
                              disabled
                              title={canPermanentlyDelete ? '完全削除は初期実装では無効です' : 'ownerのみ実行できます'}
                              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 opacity-50"
                            >
                              完全削除
                            </button>
                            <span className="self-center text-xs font-semibold text-slate-400">
                              本番運用ルール確定後に有効化
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
