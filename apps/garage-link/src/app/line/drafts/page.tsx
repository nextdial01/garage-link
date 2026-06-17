'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LineModuleShell,
  StatCards,
  type StatItem,
} from '../_components/LineModule';
import LineManagementLayout from '@/components/LineManagementLayout';
import LineDeliveryConfirmPanel from '@/components/line/shared/LineDeliveryConfirmPanel';
import LinePageHeader from '@/components/line/shared/LinePageHeader';
import LineTestDeliveryPanel from '@/components/line/shared/LineTestDeliveryPanel';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type LineMessageDraftRow = {
  id: string;
  store_id: string;
  deal_id: string | null;
  customer_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  message_type: string | null;
  title: string | null;
  status: string | null;
  line_display_name: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivery_confirmed_at: string | null;
  target_count_snapshot: number | null;
  test_sent_at: string | null;
  created_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

function displayValue(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return value.replace('T', ' ').slice(0, 16);
}

function messageTypeLabel(value: string | null) {
  switch (value) {
    case 'vehicle_proposal':
      return '車両提案';
    case 'quote_notice':
      return '見積書案内';
    case 'invoice_notice':
      return '請求書案内';
    case 'visit_reservation':
      return '来店予約案内';
    case 'follow_up':
      return 'フォローアップ';
    case 'inspection_notice':
      return '車検・整備案内';
    case 'delivery_notice':
      return '納車案内';
    case 'custom':
      return '自由入力';
    default:
      return displayValue(value);
  }
}

function statusLabel(value: string | null) {
  switch (value) {
    case 'draft':
      return '下書き';
    case 'scheduled':
      return '送信予約';
    case 'sent':
      return '送信済み';
    case 'cancelled':
      return '取消済み';
    default:
      return displayValue(value);
  }
}

function statusClass(value: string | null) {
  switch (value) {
    case 'scheduled':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'sent':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'cancelled':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

export default function LineDraftsPage() {
  const [drafts, setDrafts] = useState<LineMessageDraftRow[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('下書き');
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sendingDraftId, setSendingDraftId] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadDrafts() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user?.id) {
          throw new Error(userError?.message ?? 'ログイン情報を取得できませんでした。');
        }

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();

        if (memberError || !member?.store_id) {
          throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
        }
        setRole(member.role ?? '');

        const [draftResult, customerResult] = await Promise.all([
          supabase
            .from<LineMessageDraftRow>('line_message_drafts')
            .select('id, store_id, deal_id, customer_id, quote_id, invoice_id, message_type, title, status, line_display_name, scheduled_at, sent_at, delivery_confirmed_at, target_count_snapshot, test_sent_at, created_at')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<CustomerRow>('customers')
            .select('id, name')
            .eq('store_id', member.store_id),
        ]);

        if (draftResult.error) {
          throw new Error(draftResult.error.message);
        }

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        const nameMap = (customerResult.data ?? []).reduce<Record<string, string>>((map, customer) => {
          map[customer.id] = customer.name ?? '-';
          return map;
        }, {});

        setDrafts(draftResult.data ?? []);
        setCustomerNames(nameMap);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE下書き一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDrafts();
  }, [reloadKey]);

  const stats: StatItem[] = useMemo(() => {
    return [
      { label: '下書き件数', value: String(drafts.length) },
      { label: '下書き', value: String(drafts.filter((draft) => draft.status === 'draft').length) },
      { label: '送信予約', value: String(drafts.filter((draft) => draft.status === 'scheduled').length) },
      { label: '送信済み', value: String(drafts.filter((draft) => draft.status === 'sent').length) },
    ];
  }, [drafts]);

  const canExecuteDelivery = role === 'owner' || role === 'admin';
  const canTestDelivery = role === 'owner' || role === 'admin' || role === 'staff' || role === 'implementer';

  async function runDeliveryAction(draftId: string, action: 'test' | 'confirm' | 'send') {
    setErrorMessage('');
    setSuccessMessage('');
    setSendingDraftId(`${action}:${draftId}`);

    try {
      const response = await fetch('/api/line/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ draftId, action }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'LINEメッセージの送信に失敗しました。');
      }

      setSuccessMessage(result.message ?? 'LINE配信操作を完了しました。');
      setReloadKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'LINEメッセージの送信に失敗しました。');
    } finally {
      setSendingDraftId('');
    }
  }

  return (
    <LineModuleShell
      title="LINE下書き・送信予約"
      description="商談から作成したLINE案内文の下書き・送信予約を確認します"
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

      <LineManagementLayout
        title="LINE下書き・送信予約"
        description="商談から作成したLINE案内文の下書き・送信予約を確認します。"
        categories={['下書き', '送信予約', '送信済み', '取消済み', '車両提案', '見積案内', '請求案内'].map((label, index) => ({
          label,
          count: index === 0 ? drafts.length : 0,
        }))}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        toolbar={
          <LinePageHeader
            title="LINEメッセージ下書き一覧"
            description="下書き、予約、送信済みメッセージを確認します。"
            actions={
              <>
              <Link href="/line/templates" className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700">
                テンプレートへ
              </Link>
              <button type="button" className="rounded-xl border border-green-200 bg-white px-4 py-2.5 text-sm font-bold text-green-700 transition hover:bg-green-50">
                検索
              </button>
              </>
            }
          />
        }
      >
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h3 className="text-lg font-bold text-slate-950">LINEメッセージ下書き一覧</h3>
          <p className="mt-1 text-sm text-slate-500">
            LINE Channel Access Tokenが未設定の場合、送信時にエラーになります。
          </p>
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="m-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : drafts.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            LINEメッセージ下書きはまだありません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">作成日</th>
                  <th className="px-5 py-4">タイトル</th>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">商談</th>
                  <th className="px-5 py-4">関連帳票</th>
                  <th className="px-5 py-4">メッセージ種別</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">予約日時</th>
                  <th className="px-5 py-4">確認</th>
                  <th className="px-5 py-4">テスト</th>
                  <th className="px-5 py-4">送信日時</th>
                  <th className="px-5 py-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drafts.map((draft) => {
                  const customerName =
                    (draft.customer_id ? customerNames[draft.customer_id] : '') ||
                    draft.line_display_name ||
                    '-';

                  return (
                    <tr key={draft.id} className="hover:bg-green-50/60">
                      <td className="px-5 py-4">{formatDateTime(draft.created_at)}</td>
                      <td className="px-5 py-4 font-semibold">{displayValue(draft.title)}</td>
                      <td className="px-5 py-4 font-semibold">{customerName}</td>
                      <td className="px-5 py-4">{draft.deal_id ? '商談あり' : '-'}</td>
                      <td className="px-5 py-4">
                        {draft.quote_id ? (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-inset ring-blue-100">
                            見積書
                          </span>
                        ) : draft.invoice_id ? (
                          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-100">
                            請求書
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4">{messageTypeLabel(draft.message_type)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(draft.status)}`}>
                          {statusLabel(draft.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4">{formatDateTime(draft.scheduled_at)}</td>
                      <td className="px-5 py-4">
                        {draft.delivery_confirmed_at ? (
                          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-100">
                            確認済み {draft.target_count_snapshot ?? '-'}件
                          </span>
                        ) : (
                          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 ring-1 ring-inset ring-orange-100">
                            未確認
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">{draft.test_sent_at ? formatDateTime(draft.test_sent_at) : '-'}</td>
                      <td className="px-5 py-4">{formatDateTime(draft.sent_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-[240px] flex-wrap gap-2">
                          {draft.deal_id ? (
                            <>
                              <Link
                                href={`/deals/${draft.deal_id}`}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-green-50"
                              >
                                商談詳細
                              </Link>
                              <Link
                                href={`/deals/${draft.deal_id}/line/new`}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-green-50"
                              >
                                編集
                              </Link>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                          {draft.status === 'sent' ? (
                            <span className="rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700">
                              送信済み
                            </span>
                          ) : draft.status === 'draft' || draft.status === 'scheduled' ? (
                            <>
                              <LineTestDeliveryPanel
                                canTestDelivery={canTestDelivery}
                                isTesting={sendingDraftId === `test:${draft.id}`}
                                onTest={() => void runDeliveryAction(draft.id, 'test')}
                              />
                              <LineDeliveryConfirmPanel
                                canExecuteDelivery={canExecuteDelivery}
                                isConfirming={sendingDraftId === `confirm:${draft.id}`}
                                isSending={sendingDraftId === `send:${draft.id}`}
                                isConfirmed={Boolean(draft.delivery_confirmed_at)}
                                onConfirm={() => void runDeliveryAction(draft.id, 'confirm')}
                                onSend={() => void runDeliveryAction(draft.id, 'send')}
                              />
                            </>
                          ) : null}
                          <button
                            type="button"
                            disabled
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400"
                            title="削除・アーカイブは後工程で有効化します。"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </LineManagementLayout>
    </LineModuleShell>
  );
}
