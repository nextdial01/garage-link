'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import LineDeliveryConfirmPanel from '@/components/line/shared/LineDeliveryConfirmPanel';
import LinePageHeader from '@/components/line/shared/LinePageHeader';
import LineTestDeliveryPanel from '@/components/line/shared/LineTestDeliveryPanel';
import LinePackageShell from '@/components/line-package/LinePackageShell';
import LineStatusBadge from '@/components/line-package/LineStatusBadge';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type DraftRow = {
  id: string;
  title: string | null;
  message_type: string | null;
  status: string | null;
  line_display_name: string | null;
  delivery_confirmed_at: string | null;
  target_count_snapshot: number | null;
  test_sent_at: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type BillingSummary = {
  plan_code: string;
  plan_name: string;
  used_before: number;
  delivery_count: number;
  projected_usage: number;
  monthly_delivery_limit: number;
  overage_count: number;
  estimated_overage_amount: number;
  unlimited_delivery_enabled: boolean;
};

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

function formatYen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

export default function LinePackageMessagesPage() {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [role, setRole] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sendingDraftId, setSendingDraftId] = useState('');
  const [billingByDraft, setBillingByDraft] = useState<Record<string, BillingSummary>>({});
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

        const { data, error } = await supabase
          .from<DraftRow>('line_message_drafts')
          .select('id, title, message_type, status, line_display_name, delivery_confirmed_at, target_count_snapshot, test_sent_at, sent_at, created_at')
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        setDrafts(data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'メッセージ一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDrafts();
  }, [reloadKey]);

  const canExecuteDelivery = role === 'owner' || role === 'admin';
  const canTestDelivery = role === 'owner' || role === 'admin' || role === 'staff' || role === 'implementer';
  const stats = useMemo(() => {
    return [
      { label: '下書き', value: String(drafts.filter((draft) => draft.status === 'draft').length) },
      { label: '送信予約', value: String(drafts.filter((draft) => draft.status === 'scheduled').length) },
      { label: '送信済み', value: String(drafts.filter((draft) => draft.status === 'sent').length) },
    ];
  }, [drafts]);

  async function runDeliveryAction(draftId: string, action: 'test' | 'confirm' | 'send') {
    setErrorMessage('');
    setSuccessMessage('');
    setSendingDraftId(`${action}:${draftId}`);

    try {
      const response = await fetch('/api/line/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, action }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; message?: string; billing?: BillingSummary };

      if (!response.ok || !result.ok) {
        if (result.billing) {
          setBillingByDraft((current) => ({ ...current, [draftId]: result.billing as BillingSummary }));
        }
        throw new Error(result.error ?? 'LINEメッセージの送信に失敗しました。');
      }

      if (result.billing) {
        setBillingByDraft((current) => ({ ...current, [draftId]: result.billing as BillingSummary }));
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
    <LinePackageShell
      title="メッセージ配信"
      description="LINE単体パッケージのメッセージ下書き、テスト配信、配信前確認、本配信を管理します。"
      action={<Link href="/line-package/messages/new" className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm">新規作成</Link>}
    >
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-green-100 bg-white shadow-sm">
        <div className="border-b border-green-50 p-5">
          <LinePageHeader
            title="メッセージ一覧"
            description="LINE単体画面では商談・見積・請求への導線を表示しません。"
          />
        </div>
        {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {successMessage && <p className="m-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}
        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : drafts.length === 0 ? (
          <p className="p-5 text-sm font-semibold text-slate-500">メッセージ下書きはまだありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">作成日</th>
                  <th className="px-5 py-4">タイトル</th>
                  <th className="px-5 py-4">宛先表示名</th>
                  <th className="px-5 py-4">種別</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">確認</th>
                  <th className="px-5 py-4">テスト</th>
                  <th className="px-5 py-4">送信日時</th>
                  <th className="px-5 py-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drafts.map((draft) => (
                  <tr key={draft.id} className="hover:bg-green-50/60">
                    <td className="px-5 py-4">{formatDateTime(draft.created_at)}</td>
                    <td className="px-5 py-4 font-semibold">{draft.title || '-'}</td>
                    <td className="px-5 py-4">{draft.line_display_name || '-'}</td>
                    <td className="px-5 py-4">{draft.message_type || '-'}</td>
                    <td className="px-5 py-4"><LineStatusBadge value={draft.status} /></td>
                    <td className="px-5 py-4">{draft.delivery_confirmed_at ? `確認済み ${draft.target_count_snapshot ?? '-'}件` : '未確認'}</td>
                    <td className="px-5 py-4">{formatDateTime(draft.test_sent_at)}</td>
                    <td className="px-5 py-4">{formatDateTime(draft.sent_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex min-w-[220px] flex-wrap gap-2">
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
                      </div>
                      {billingByDraft[draft.id] && (
                        <div className="mt-3 min-w-[280px] rounded-xl border border-green-100 bg-green-50 px-3 py-3 text-xs leading-5 text-green-900">
                          <p className="font-bold">配信前確認</p>
                          <p>契約プラン: {billingByDraft[draft.id].plan_name}</p>
                          <p>
                            当月配信済み: {billingByDraft[draft.id].used_before.toLocaleString()}通 / 今回: {billingByDraft[draft.id].delivery_count.toLocaleString()}通
                          </p>
                          <p>月間配信上限: {billingByDraft[draft.id].unlimited_delivery_enabled ? '無制限オプション適用中' : `${billingByDraft[draft.id].monthly_delivery_limit.toLocaleString()}通`}</p>
                          <p>超過見込み: {billingByDraft[draft.id].overage_count.toLocaleString()}通</p>
                          <p>追加料金見込み: {formatYen(billingByDraft[draft.id].estimated_overage_amount)} 税抜</p>
                          {billingByDraft[draft.id].unlimited_delivery_enabled && (
                            <p className="mt-1 font-semibold">本サービス上の配信通数上限が無制限になります。LINE公式アカウント側の料金・配信通数は別途発生する場合があります。</p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </LinePackageShell>
  );
}
