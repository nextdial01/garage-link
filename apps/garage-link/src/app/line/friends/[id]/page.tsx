'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  LineModuleShell,
  inputClass,
} from '../../_components/LineModule';
import { createClient } from '@/lib/supabase/client';

type LineFriendRow = {
  id: string;
  store_id: string;
  customer_id: string | null;
  line_user_id: string;
  line_display_name: string | null;
  line_picture_url: string | null;
  line_status_message: string | null;
  friend_status: string | null;
  delivery_permission: boolean | null;
  blocked_at: string | null;
  followed_at: string | null;
  last_interaction_at: string | null;
  tag_names: string[] | null;
  internal_memo: string | null;
};

type LineFriendUpdate = {
  customer_id?: string | null;
  tag_names?: string[] | null;
  delivery_permission?: boolean;
  friend_status?: string;
  internal_memo?: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

type CustomerUpdate = {
  line_user_id: string | null;
  line_display_name: string | null;
  line_friend_status: string | null;
  delivery_permission: string | null;
};

type DealRow = {
  id: string;
  deal_no: string | null;
  title: string | null;
  status: string | null;
  created_at: string | null;
};

type DraftRow = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  message_type: string | null;
  title: string | null;
  status: string | null;
  created_at: string | null;
};

type LogRow = {
  id: string;
  customer_id: string | null;
  line_user_id: string | null;
  message_type: string | null;
  title: string | null;
  send_status: string | null;
  sent_at: string | null;
  created_at: string | null;
};

function displayValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return value.replace('T', ' ').slice(0, 16);
}

function friendStatusLabel(value: string | null | undefined) {
  switch (value) {
    case 'friend':
      return '友だち';
    case 'blocked':
      return 'ブロック';
    case 'unknown':
      return '不明';
    default:
      return displayValue(value);
  }
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
      return '車検・点検案内';
    default:
      return displayValue(value);
  }
}

function toCustomerLineStatus(status: string | null | undefined) {
  if (status === 'blocked') {
    return 'ブロック';
  }

  if (status === 'friend') {
    return '友だち';
  }

  return '未連携';
}

function InfoItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{displayValue(value)}</dd>
    </div>
  );
}

export default function LineFriendDetailPage() {
  const params = useParams<{ id: string }>();
  const friendId = params.id;
  const [friend, setFriend] = useState<LineFriendRow | null>(null);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [memo, setMemo] = useState('');
  const [deliveryPermission, setDeliveryPermission] = useState('true');
  const [friendStatus, setFriendStatus] = useState('friend');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadDetail() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const supabase = createClient();
        const { data: friendData, error: friendError } = await supabase
          .from<LineFriendRow>('line_friends')
          .select('id, store_id, customer_id, line_user_id, line_display_name, line_picture_url, line_status_message, friend_status, delivery_permission, blocked_at, followed_at, last_interaction_at, tag_names, internal_memo')
          .eq('id', friendId)
          .single();

        if (friendError || !friendData) {
          throw new Error(friendError?.message ?? 'LINE友だちが見つかりません。');
        }

        const [customersResult, dealsResult, draftsResult, logsResult] = await Promise.all([
          supabase
            .from<CustomerRow>('customers')
            .select('id, name, phone, email')
            .eq('store_id', friendData.store_id)
            .order('created_at', { ascending: false }),
          friendData.customer_id
            ? supabase
                .from<DealRow>('deals')
                .select('id, deal_no, title, status, created_at')
                .eq('customer_id', friendData.customer_id)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from<DraftRow>('line_message_drafts')
            .select('id, customer_id, line_user_id, message_type, title, status, created_at')
            .eq('store_id', friendData.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<LogRow>('line_message_logs')
            .select('id, customer_id, line_user_id, message_type, title, send_status, sent_at, created_at')
            .eq('store_id', friendData.store_id)
            .order('created_at', { ascending: false }),
        ]);

        if (customersResult.error) {
          throw new Error(customersResult.error.message);
        }

        if (dealsResult.error) {
          throw new Error(dealsResult.error.message);
        }

        if (draftsResult.error) {
          throw new Error(draftsResult.error.message);
        }

        if (logsResult.error) {
          throw new Error(logsResult.error.message);
        }

        const relatedDrafts = (draftsResult.data ?? []).filter(
          (draft) =>
            draft.line_user_id === friendData.line_user_id ||
            (friendData.customer_id && draft.customer_id === friendData.customer_id)
        );
        const relatedLogs = (logsResult.data ?? []).filter(
          (log) =>
            log.line_user_id === friendData.line_user_id ||
            (friendData.customer_id && log.customer_id === friendData.customer_id)
        );

        setFriend(friendData);
        setCustomers(customersResult.data ?? []);
        setDeals((dealsResult.data ?? []).slice(0, 5));
        setDrafts(relatedDrafts.slice(0, 5));
        setLogs(relatedLogs.slice(0, 5));
        setSelectedCustomerId(friendData.customer_id ?? '');
        setTagInput((friendData.tag_names ?? []).join(', '));
        setMemo(friendData.internal_memo ?? '');
        setDeliveryPermission(friendData.delivery_permission === false ? 'false' : 'true');
        setFriendStatus(friendData.friend_status ?? 'friend');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE友だち詳細の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadDetail();
  }, [friendId, reloadKey]);

  const currentCustomer = friend?.customer_id
    ? customers.find((customer) => customer.id === friend.customer_id) ?? null
    : null;

  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();

    if (!keyword) {
      return customers.slice(0, 10);
    }

    return customers
      .filter((customer) =>
        [customer.name, customer.phone, customer.email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      )
      .slice(0, 10);
  }, [customerSearch, customers]);

  function tagArray() {
    const tags = tagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return tags.length > 0 ? tags : null;
  }

  async function saveCustomerLink(nextCustomerId = selectedCustomerId) {
    if (!friend) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSaving(true);

    try {
      const supabase = createClient();
      const customerId = nextCustomerId || null;
      const { error: friendError } = await supabase
        .from<LineFriendUpdate>('line_friends')
        .update({ customer_id: customerId })
        .eq('id', friend.id);

      if (friendError) {
        throw new Error(friendError.message);
      }

      if (customerId) {
        const { error: customerError } = await supabase
          .from<CustomerUpdate>('customers')
          .update({
            line_user_id: friend.line_user_id,
            line_display_name: friend.line_display_name,
            line_friend_status: toCustomerLineStatus(friend.friend_status),
            delivery_permission: friend.delivery_permission === false ? '不許可' : '許可',
          })
          .eq('id', customerId);

        if (customerError) {
          throw new Error(customerError.message);
        }
      }

      setSuccessMessage(customerId ? '顧客を紐付けました。' : '紐付けを解除しました。');
      setReloadKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '顧客紐付けの保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveTagsAndSettings(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!friend) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from<LineFriendUpdate>('line_friends')
        .update({
          tag_names: tagArray(),
          delivery_permission: deliveryPermission === 'true',
          friend_status: friendStatus,
          internal_memo: memo.trim() || null,
        })
        .eq('id', friend.id);

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage('LINE友だち情報を保存しました。');
      setReloadKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'LINE友だち情報の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <LineModuleShell
      title="LINE友だち詳細"
      description="LINE友だちごとの顧客紐付け、タグ、配信設定を管理します"
      actionButton={
        <Link href="/line/friends" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50">
          友だち一覧へ戻る
        </Link>
      }
    >
      {errorMessage && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
      {successMessage && <p className="mb-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}

      {isLoading ? (
        <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">読み込み中...</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
              <h3 className="text-lg font-bold text-slate-950">LINE友だち情報</h3>
            </div>
            <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-[120px_1fr]">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-green-50 text-xl font-bold text-green-700 ring-1 ring-inset ring-green-100">
                {friend?.line_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={friend.line_picture_url} alt="プロフィール画像" className="h-full w-full object-cover" />
                ) : (
                  displayValue(friend?.line_display_name).slice(0, 1)
                )}
              </div>
              <dl className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem label="LINE表示名" value={friend?.line_display_name} />
                <InfoItem label="LINE userId" value={friend?.line_user_id} />
                <InfoItem label="友だち状態" value={friendStatusLabel(friend?.friend_status)} />
                <InfoItem label="配信許可" value={friend?.delivery_permission ? '許可' : '不許可'} />
                <InfoItem label="ステータスメッセージ" value={friend?.line_status_message} />
                <InfoItem label="友だち追加日" value={formatDateTime(friend?.followed_at)} />
                <InfoItem label="ブロック日時" value={formatDateTime(friend?.blocked_at)} />
                <InfoItem label="最終反応日時" value={formatDateTime(friend?.last_interaction_at)} />
              </dl>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
              <h3 className="text-lg font-bold text-slate-950">顧客紐付け</h3>
              <p className="mt-1 text-sm text-slate-500">現在紐付いている顧客: {displayValue(currentCustomer?.name)}</p>
            </div>
            <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
              <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="顧客名・電話番号・メールで検索" className={inputClass} />
              <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className={inputClass}>
                <option value="">未紐付け</option>
                {filteredCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name ?? '名称未設定'} / {customer.phone ?? customer.email ?? '-'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-5 py-5 sm:px-6">
              <button type="button" disabled={isSaving} onClick={() => void saveCustomerLink()} className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:bg-slate-300">
                顧客を紐付ける
              </button>
              <button type="button" disabled={isSaving} onClick={() => { setSelectedCustomerId(''); void saveCustomerLink(''); }} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-green-50">
                紐付け解除
              </button>
            </div>
          </section>

          <form onSubmit={saveTagsAndSettings} className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">タグ</h3>
              </div>
              <div className="px-5 py-6 sm:px-6">
                <div className="mb-4 flex flex-wrap gap-2">
                  {(tagArray() ?? []).map((tag) => (
                    <span key={tag} className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-100">{tag}</span>
                  ))}
                </div>
                <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="例：250cc希望, 購入検討中" className={inputClass} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">配信設定</h3>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
                <select value={deliveryPermission} onChange={(event) => setDeliveryPermission(event.target.value)} className={inputClass}>
                  <option value="true">配信許可</option>
                  <option value="false">配信停止</option>
                </select>
                <select value={friendStatus} onChange={(event) => setFriendStatus(event.target.value)} className={inputClass}>
                  <option value="friend">友だち</option>
                  <option value="blocked">ブロック状態</option>
                  <option value="unknown">不明</option>
                </select>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">社内メモ</h3>
              </div>
              <div className="px-5 py-6 sm:px-6">
                <textarea rows={5} value={memo} onChange={(event) => setMemo(event.target.value)} className={inputClass} />
              </div>
              <div className="flex justify-end border-t border-slate-100 px-5 py-5 sm:px-6">
                <button type="submit" disabled={isSaving} className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:bg-slate-300">
                  {isSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </section>
          </form>

          <section className="grid gap-6 lg:grid-cols-3">
            <RelatedCard title="紐付け顧客の商談一覧" rows={deals.map((deal) => ({
              id: deal.id,
              title: `${displayValue(deal.deal_no)} ${displayValue(deal.title)}`,
              meta: `${displayValue(deal.status)} / ${formatDateTime(deal.created_at)}`,
              href: `/deals/${deal.id}`,
            }))} />
            <RelatedCard title="LINE下書き" rows={drafts.map((draft) => ({
              id: draft.id,
              title: displayValue(draft.title),
              meta: `${messageTypeLabel(draft.message_type)} / ${displayValue(draft.status)} / ${formatDateTime(draft.created_at)}`,
            }))} />
            <RelatedCard title="LINE送信ログ" rows={logs.map((log) => ({
              id: log.id,
              title: displayValue(log.title),
              meta: `${messageTypeLabel(log.message_type)} / ${displayValue(log.send_status)} / ${formatDateTime(log.sent_at ?? log.created_at)}`,
            }))} />
          </section>
        </div>
      )}
    </LineModuleShell>
  );
}

function RelatedCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; title: string; meta: string; href?: string }>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5">
        <h3 className="text-base font-bold text-slate-950">{title}</h3>
      </div>
      <div className="space-y-3 p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">該当データはありません。</p>
        ) : (
          rows.map((row) => {
            const content = (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-950">{row.title}</p>
                <p className="mt-1 text-xs text-slate-500">{row.meta}</p>
              </div>
            );

            return row.href ? (
              <Link key={row.id} href={row.href} className="block transition hover:opacity-80">
                {content}
              </Link>
            ) : (
              <div key={row.id}>{content}</div>
            );
          })
        )}
      </div>
    </section>
  );
}
