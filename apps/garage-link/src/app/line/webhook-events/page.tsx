'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LineModuleShell,
  StatCards,
  type StatItem,
} from '../_components/LineModule';
import LineManagementLayout from '@/components/LineManagementLayout';
import LinePageHeader from '@/components/line/shared/LinePageHeader';
import LineWebhookEventTable from '@/components/line/shared/LineWebhookEventTable';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type LineWebhookEventRow = {
  id: string;
  store_id: string | null;
  source_user_hash: string | null;
  event_type: string | null;
  message_type: string | null;
  raw_event_hash: string | null;
  signature_valid: boolean | null;
  processed: boolean | null;
  received_at: string | null;
};

export default function LineWebhookEventsPage() {
  const [events, setEvents] = useState<LineWebhookEventRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全イベント');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
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

        const { data, error } = await supabase
          .from<LineWebhookEventRow>('line_webhook_events')
          .select('id, store_id, source_user_hash, event_type, message_type, raw_event_hash, signature_valid, processed, received_at')
          .eq('store_id', member.store_id)
          .order('received_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setEvents(data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE Webhookイベント一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadEvents();
  }, []);

  const stats: StatItem[] = useMemo(() => {
    return [
      { label: 'イベント件数', value: String(events.length) },
      { label: '署名OK', value: String(events.filter((event) => event.signature_valid).length) },
      { label: '未処理', value: String(events.filter((event) => !event.processed).length) },
      { label: '処理済み', value: String(events.filter((event) => event.processed).length) },
    ];
  }, [events]);

  return (
    <LineModuleShell
      title="Webhookイベント"
      description="LINEから受信したWebhookイベントを確認します"
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
        title="Webhookイベント"
        description="LINEから受信したWebhookイベントを確認します。"
        categories={['全イベント', '未処理', '処理済み', '署名OK', 'メッセージ', 'フォロー', 'ブロック'].map((label, index) => ({
          label,
          count: index === 0 ? events.length : 0,
        }))}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        toolbar={
          <LinePageHeader
            title="LINE Webhookイベント一覧"
            description="受信イベントと処理状態を確認します。"
            actions={
            <button type="button" className="rounded-xl border border-green-200 bg-white px-4 py-2.5 text-sm font-bold text-green-700 transition hover:bg-green-50">
              検索
            </button>
            }
          />
        }
      >
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h3 className="text-lg font-bold text-slate-950">LINE Webhookイベント一覧</h3>
              <p className="mt-1 text-sm text-slate-500">
            Webhook本文やLINE userIdは保存せず、hashと種別だけを表示します。
          </p>
        </div>

        {errorMessage && (
          <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : events.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            LINE Webhookイベントはまだありません
          </p>
        ) : (
          <LineWebhookEventTable events={events} />
        )}
      </section>
      </LineManagementLayout>
    </LineModuleShell>
  );
}
