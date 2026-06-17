'use client';

import { useEffect, useMemo, useState } from 'react';
import LineMetricCard from '@/components/line-package/LineMetricCard';
import LinePackageShell from '@/components/line-package/LinePackageShell';
import LineStatusBadge from '@/components/line-package/LineStatusBadge';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type LineFriendRow = {
  id: string;
  delivery_permission: boolean | null;
  friend_status: string | null;
};

type DraftRow = {
  id: string;
  status: string | null;
  created_at: string | null;
};

type FormResponseRow = {
  id: string;
};

type DeliveryLogRow = {
  id: string;
  delivery_type: string | null;
  status: string | null;
  target_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  sent_at: string | null;
  created_at: string | null;
};

type WebhookEventRow = {
  id: string;
  event_type: string | null;
  message_type: string | null;
  status: string | null;
  signature_valid: boolean | null;
  received_at: string | null;
  created_at: string | null;
};

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

export default function LinePackageDashboardPage() {
  const [friends, setFriends] = useState<LineFriendRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [formResponses, setFormResponses] = useState<FormResponseRow[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLogRow[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
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
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();

        if (memberError || !member?.store_id) {
          throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
        }

        const [friendsResult, draftsResult, formsResult, deliveryLogsResult, webhookEventsResult] = await Promise.all([
          supabase
            .from<LineFriendRow>('line_friends')
            .select('id, delivery_permission, friend_status')
            .eq('store_id', member.store_id),
          supabase
            .from<DraftRow>('line_message_drafts')
            .select('id, status, created_at')
            .eq('store_id', member.store_id),
          supabase
            .from<FormResponseRow>('line_form_responses')
            .select('id')
            .eq('store_id', member.store_id),
          supabase
            .from<DeliveryLogRow>('line_delivery_logs')
            .select('id, delivery_type, status, target_count, sent_count, failed_count, sent_at, created_at')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<WebhookEventRow>('line_webhook_events')
            .select('id, event_type, message_type, status, signature_valid, received_at, created_at')
            .eq('store_id', member.store_id)
            .order('received_at', { ascending: false }),
        ]);

        if (friendsResult.error) throw new Error(friendsResult.error.message);
        if (draftsResult.error) throw new Error(draftsResult.error.message);

        setFriends(friendsResult.data ?? []);
        setDrafts(draftsResult.data ?? []);
        setFormResponses(formsResult.error ? [] : formsResult.data ?? []);
        setDeliveryLogs(deliveryLogsResult.error ? [] : (deliveryLogsResult.data ?? []).slice(0, 5));
        setWebhookEvents(webhookEventsResult.error ? [] : (webhookEventsResult.data ?? []).slice(0, 5));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE単体ダッシュボードの取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  const metrics = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const sentThisMonth = drafts.filter((draft) => draft.status === 'sent' && draft.created_at?.startsWith(thisMonth)).length;

    return [
      { label: '友だち数', value: String(friends.length), note: 'LINE友だち管理' },
      { label: '今月の配信数', value: String(sentThisMonth), note: '送信済み下書き' },
      { label: 'フォーム回答数', value: String(formResponses.length), note: '回答フォーム' },
      { label: '未対応問い合わせ数', value: '0', note: '問い合わせ管理は準備中' },
    ];
  }, [drafts, formResponses.length, friends.length]);

  return (
    <LinePackageShell
      title="LINEダッシュボード"
      description="LINE単体パッケージとして、友だち・配信・フォーム回答の状況を確認します。"
    >
      {errorMessage && (
        <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      )}
      {isLoading ? (
        <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">読み込み中...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <LineMetricCard key={metric.label} {...metric} />
            ))}
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-green-100 bg-white shadow-sm">
              <div className="border-b border-green-50 p-5">
                <h2 className="text-lg font-bold text-slate-950">直近の配信履歴</h2>
                <p className="mt-1 text-sm text-slate-500">本文やLINE userIdは表示しません。</p>
              </div>
              {deliveryLogs.length === 0 ? (
                <p className="p-5 text-sm font-semibold text-slate-500">配信履歴はまだありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-4">日時</th>
                        <th className="px-5 py-4">種別</th>
                        <th className="px-5 py-4">状態</th>
                        <th className="px-5 py-4 text-right">対象</th>
                        <th className="px-5 py-4 text-right">成功</th>
                        <th className="px-5 py-4 text-right">失敗</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deliveryLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-green-50/60">
                          <td className="px-5 py-4">{formatDateTime(log.sent_at ?? log.created_at)}</td>
                          <td className="px-5 py-4">{log.delivery_type ?? '-'}</td>
                          <td className="px-5 py-4"><LineStatusBadge value={log.status} /></td>
                          <td className="px-5 py-4 text-right">{log.target_count ?? 0}</td>
                          <td className="px-5 py-4 text-right">{log.sent_count ?? 0}</td>
                          <td className="px-5 py-4 text-right">{log.failed_count ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-green-100 bg-white shadow-sm">
              <div className="border-b border-green-50 p-5">
                <h2 className="text-lg font-bold text-slate-950">直近のWebhookイベント</h2>
                <p className="mt-1 text-sm text-slate-500">raw_event、本文、LINE userIdは表示しません。</p>
              </div>
              {webhookEvents.length === 0 ? (
                <p className="p-5 text-sm font-semibold text-slate-500">Webhookイベントはまだありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-4">受信日時</th>
                        <th className="px-5 py-4">イベント</th>
                        <th className="px-5 py-4">メッセージ種別</th>
                        <th className="px-5 py-4">状態</th>
                        <th className="px-5 py-4">署名</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {webhookEvents.map((event) => (
                        <tr key={event.id} className="hover:bg-green-50/60">
                          <td className="px-5 py-4">{formatDateTime(event.received_at ?? event.created_at)}</td>
                          <td className="px-5 py-4">{event.event_type ?? '-'}</td>
                          <td className="px-5 py-4">{event.message_type ?? '-'}</td>
                          <td className="px-5 py-4"><LineStatusBadge value={event.status ?? 'received'} /></td>
                          <td className="px-5 py-4">{event.signature_valid ? '検証済み' : '未検証'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <section className="mt-6 rounded-2xl border border-green-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">LINE単体プラン</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          この画面ではLINE管理のみを扱います。車両管理、商談、見積・請求、整備機能は表示しません。
          GARAGE LINKへアップグレードすると、同じtenant_idのまま機能を追加できます。
        </p>
      </section>
    </LinePackageShell>
  );
}
