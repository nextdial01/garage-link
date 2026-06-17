'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

type LineSettingsRow = {
  store_id: string;
  line_account_name: string | null;
  connection_status: string | null;
  webhook_enabled: boolean | null;
};

type IdRow = {
  id: string;
  created_at?: string | null;
};

type LineFriendSummaryRow = {
  id: string;
  line_display_name: string | null;
  friend_status: string | null;
  delivery_permission: boolean | null;
  last_interaction_at: string | null;
};

type DraftRow = {
  id: string;
  title: string | null;
  message_type: string | null;
  status: string | null;
  scheduled_at: string | null;
  created_at: string | null;
};

type LogRow = {
  id: string;
  title: string | null;
  message_type: string | null;
  send_status: string | null;
  error_message: string | null;
  sent_at: string | null;
};

type LineCounts = {
  friends: number;
  blocked: number;
  deliveryAllowed: number;
  drafts: number;
  sent: number;
  failed: number;
  webhookEvents: number;
  tags: number;
  templates: number;
  campaigns: number;
  steps: number;
  forms: number;
  richMenus: number;
  autoReplies: number;
  routes: number;
};

const emptyCounts: LineCounts = {
  friends: 0,
  blocked: 0,
  deliveryAllowed: 0,
  drafts: 0,
  sent: 0,
  failed: 0,
  webhookEvents: 0,
  tags: 0,
  templates: 0,
  campaigns: 0,
  steps: 0,
  forms: 0,
  richMenus: 0,
  autoReplies: 0,
  routes: 0,
};

const featureCards = [
  { title: '友だち管理', href: '/line/friends', description: 'LINE友だち、顧客紐付け、配信許可を確認します。', mark: '友' },
  { title: 'タグ管理', href: '/line/tags', description: '希望条件、購入時期、車検対象などの分類を管理します。', mark: '札' },
  { title: 'テンプレート', href: '/line/templates', description: '商談・見積・請求・車検案内の定型文を管理します。', mark: '文' },
  { title: 'メッセージ配信', href: '/line/campaigns', description: '対象者を絞って一斉配信を作成します。', mark: '配' },
  { title: 'ステップ配信', href: '/line/steps', description: '購入後フォローや車検前案内を自動化します。', mark: 'S' },
  { title: 'フォーム作成', href: '/line/forms', description: '来店予約、査定依頼、整備相談フォームを作成します。', mark: '問' },
  { title: 'リッチメニュー', href: '/line/rich-menus', description: '在庫検索や予約導線の入口を編集します。', mark: 'RM' },
  { title: '自動応答', href: '/line/auto-replies', description: 'キーワードに応じた自動返信を設定します。', mark: '応' },
  { title: '流入経路', href: '/line/routes', description: 'QR、SNS、Webなどの登録経路を整理します。', mark: '経' },
  { title: '送信ログ', href: '/line/message-logs', description: '送信結果、失敗理由、履歴を確認します。', mark: '送' },
  { title: 'LINE設定', href: '/line/settings', description: '公式アカウント、Webhook、配信制御を設定します。', mark: '設' },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function KpiCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'green' | 'red' | 'slate' }) {
  const accent = {
    green: 'bg-green-600',
    red: 'bg-red-500',
    slate: 'bg-slate-500',
  }[tone];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 h-1.5 w-12 rounded-full ${accent}`} />
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-400">{detail}</p>
    </section>
  );
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const isError = value === 'failed' || value === 'エラー' || value === 'blocked';
  const className = isError
    ? 'bg-red-50 text-red-700 ring-red-100'
    : 'bg-green-50 text-green-700 ring-green-100';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${className}`}>
      {value || '未設定'}
    </span>
  );
}

function MiniPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-black text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function LinePage() {
  const [lineSettings, setLineSettings] = useState<LineSettingsRow | null>(null);
  const [settingsMessage, setSettingsMessage] = useState('LINE設定を確認中...');
  const [counts, setCounts] = useState<LineCounts>(emptyCounts);
  const [friends, setFriends] = useState<LineFriendSummaryRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadLineSummary() {
      setIsLoading(true);

      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user?.id) {
          setSettingsMessage('ログイン後にLINE設定状態を確認できます');
          return;
        }

        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id')
          .eq('user_id', userData.user.id)
          .single();

        if (!member?.store_id) {
          setSettingsMessage('LINE設定が未完了です');
          return;
        }

        const [
          settingsResult,
          friendsResult,
          draftsResult,
          logsResult,
          webhookResult,
          tagsResult,
          templatesResult,
          campaignsResult,
          stepsResult,
          formsResult,
          richMenusResult,
          autoRepliesResult,
          routesResult,
        ] = await Promise.all([
          supabase
            .from<LineSettingsRow>('line_settings')
            .select('store_id, line_account_name, connection_status, webhook_enabled')
            .eq('store_id', member.store_id)
            .single(),
          supabase
            .from<LineFriendSummaryRow>('line_friends')
            .select('id, line_display_name, friend_status, delivery_permission, last_interaction_at')
            .eq('store_id', member.store_id),
          supabase
            .from<DraftRow>('line_message_drafts')
            .select('id, title, message_type, status, scheduled_at, created_at')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<LogRow>('line_message_logs')
            .select('id, title, message_type, send_status, error_message, sent_at')
            .eq('store_id', member.store_id)
            .order('sent_at', { ascending: false }),
          supabase.from<IdRow>('line_webhook_events').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_tags').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_templates').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_campaigns').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_steps').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_forms').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_rich_menus').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_auto_replies').select('id').eq('store_id', member.store_id),
          supabase.from<IdRow>('line_routes').select('id').eq('store_id', member.store_id),
        ]);

        if (settingsResult.data?.store_id) {
          setLineSettings(settingsResult.data);
          setSettingsMessage('LINE設定済み');
        } else {
          setSettingsMessage('LINE設定が未完了です');
        }

        const friendRows = friendsResult.data ?? [];
        const logRows = logsResult.data ?? [];
        const draftRows = draftsResult.data ?? [];

        setFriends(friendRows);
        setDrafts(draftRows);
        setLogs(logRows);
        setCounts({
          friends: friendRows.length,
          blocked: friendRows.filter((friend) => friend.friend_status === 'blocked' || friend.friend_status === 'ブロック').length,
          deliveryAllowed: friendRows.filter((friend) => friend.delivery_permission !== false).length,
          drafts: draftRows.length,
          sent: logRows.filter((log) => log.send_status === 'sent').length,
          failed: logRows.filter((log) => log.send_status === 'failed').length,
          webhookEvents: webhookResult.data?.length ?? 0,
          tags: tagsResult.data?.length ?? 0,
          templates: templatesResult.data?.length ?? 0,
          campaigns: campaignsResult.data?.length ?? 0,
          steps: stepsResult.data?.length ?? 0,
          forms: formsResult.data?.length ?? 0,
          richMenus: richMenusResult.data?.length ?? 0,
          autoReplies: autoRepliesResult.data?.length ?? 0,
          routes: routesResult.data?.length ?? 0,
        });
      } catch {
        setSettingsMessage('LINE設定が未完了です');
      } finally {
        setIsLoading(false);
      }
    }

    void loadLineSummary();
  }, []);

  const lineSettingStatus = useMemo(() => {
    if (!lineSettings) return settingsMessage;
    if (lineSettings.connection_status === 'connected') return 'LINE設定済み / 接続済み';
    if (lineSettings.connection_status === 'error') return 'LINE設定済み / エラー';
    return 'LINE設定済み / 未接続';
  }, [lineSettings, settingsMessage]);

  const recentLogs = logs.slice(0, 5);
  const recentDrafts = drafts.slice(0, 5);
  const recentFriends = friends.slice(0, 5);

  return (
    <AppShell
      activeLabel="ダッシュボード"
      title="LINE管理ダッシュボード"
      description="友だち、配信、下書き、送信ログ、LINE設定の状況を確認します。車両管理情報は表示しません。"
      actionButton={
        <Link href="/line/settings" className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-green-700">
          LINE設定を開く
        </Link>
      }
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-green-100 bg-gradient-to-br from-white to-green-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black text-green-700">LINE Operations</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">LINE接客の運用状況</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                友だち管理、配信、シナリオ、フォーム、リッチメニューをLINE管理専用の画面で確認します。
              </p>
            </div>
            <div className="rounded-2xl border border-green-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-bold text-slate-400">LINE接続状態</p>
              <p className="mt-1 text-sm font-black text-slate-800">{isLoading ? '読み込み中' : lineSettingStatus}</p>
              {lineSettings?.line_account_name && <p className="mt-1 text-xs font-semibold text-slate-500">{lineSettings.line_account_name}</p>}
            </div>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="友だち数" value={`${counts.friends}`} detail="登録済みLINE友だち" tone="green" />
          <KpiCard label="ブロック数" value={`${counts.blocked}`} detail="ブロック状態" tone="red" />
          <KpiCard label="配信許可数" value={`${counts.deliveryAllowed}`} detail="送信対象候補" tone="green" />
          <KpiCard label="今月の配信数" value={`${counts.sent}`} detail="送信済みログ" tone="green" />
          <KpiCard label="下書き数" value={`${counts.drafts}`} detail="作成済み下書き" tone="slate" />
          <KpiCard label="送信失敗数" value={`${counts.failed}`} detail="対応が必要なログ" tone="red" />
        </div>

        {!lineSettings || lineSettings.connection_status !== 'connected' ? (
          <section className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm font-bold text-orange-900">
            LINE接続未設定です。配信・Webhook連携を使うにはLINE設定を完了してください。
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <MiniPanel title="メッセージ配信パフォーマンス">
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <div className="rounded-xl bg-green-50 p-4">
                <p className="text-xs font-bold text-green-700">送信済み</p>
                <p className="mt-2 text-2xl font-black text-green-800">{counts.sent}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs font-bold text-red-700">失敗</p>
                <p className="mt-2 text-2xl font-black text-red-800">{counts.failed}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-slate-500">Webhook</p>
                <p className="mt-2 text-2xl font-black text-slate-800">{counts.webhookEvents}</p>
              </div>
            </div>
          </MiniPanel>

          <MiniPanel title="最近の送信ログ">
            <div className="divide-y divide-slate-100">
              {recentLogs.map((log) => (
                <Link key={log.id} href="/line/message-logs" className="block px-5 py-4 transition hover:bg-green-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{log.title ?? log.message_type ?? 'LINEメッセージ'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(log.sent_at)} / {log.error_message ?? 'エラーなし'}</p>
                    </div>
                    <StatusBadge value={log.send_status} />
                  </div>
                </Link>
              ))}
              {recentLogs.length === 0 && <p className="px-5 py-8 text-center text-sm font-bold text-slate-400">データがありません</p>}
            </div>
          </MiniPanel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <MiniPanel title="最近の下書き">
            <div className="divide-y divide-slate-100">
              {recentDrafts.map((draft) => (
                <Link key={draft.id} href="/line/drafts" className="block px-5 py-4 transition hover:bg-green-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{draft.title ?? draft.message_type ?? '下書き'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">予約: {formatDateTime(draft.scheduled_at)}</p>
                    </div>
                    <StatusBadge value={draft.status} />
                  </div>
                </Link>
              ))}
              {recentDrafts.length === 0 && <p className="px-5 py-8 text-center text-sm font-bold text-slate-400">データがありません</p>}
            </div>
          </MiniPanel>

          <MiniPanel title="最近の友だち">
            <div className="divide-y divide-slate-100">
              {recentFriends.map((friend) => (
                <Link key={friend.id} href={`/line/friends/${friend.id}`} className="block px-5 py-4 transition hover:bg-green-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{friend.line_display_name ?? 'LINE友だち'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">最終反応: {formatDateTime(friend.last_interaction_at)}</p>
                    </div>
                    <StatusBadge value={friend.friend_status} />
                  </div>
                </Link>
              ))}
              {recentFriends.length === 0 && <p className="px-5 py-8 text-center text-sm font-bold text-slate-400">データがありません</p>}
            </div>
          </MiniPanel>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5">
            <h3 className="text-lg font-black text-slate-950">LINE運用メニュー</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">LINE管理だけの機能カードです。車両管理への導線は表示しません。</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-green-200 hover:bg-green-50/60 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-50 text-sm font-black text-green-700 transition group-hover:bg-green-600 group-hover:text-white">
                    {card.mark}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-black text-slate-950">{card.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
                  </div>
                  <span className="mt-1 text-sm font-black text-slate-400 transition group-hover:text-green-600">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
