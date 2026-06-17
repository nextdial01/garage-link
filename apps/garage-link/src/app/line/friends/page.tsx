'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineModuleShell,
  StatCards,
  inputClass,
  type StatItem,
} from '../_components/LineModule';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
};

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
  source_route: string | null;
  tag_names: string[] | null;
  internal_memo: string | null;
};

type LineFriendInsert = {
  store_id: string;
  customer_id: string | null;
  line_user_id: string;
  line_display_name: string | null;
  friend_status: string;
  delivery_permission: boolean;
  tag_names: string[] | null;
  internal_memo: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

const emptyAddForm = {
  line_display_name: '',
  line_user_id: '',
  customer_id: '',
  friend_status: 'friend',
  delivery_permission: 'true',
  tag_names: '',
  internal_memo: '',
};

const friendCategories = ['全員', '未紐付け', '顧客紐付け済み', '配信許可', '配信停止', 'ブロック', 'タグあり', '最近反応あり'];

function displayValue(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-';
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

function statusClass(value: string | null | undefined) {
  switch (value) {
    case 'friend':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'blocked':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-600/20';
  }
}

function toTagArray(value: string) {
  const tags = value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : null;
}

export default function LineFriendsPage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState('');
  const [friends, setFriends] = useState<LineFriendRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [permissionFilter, setPermissionFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全員');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadFriends() {
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

        setStoreId(member.store_id);

        const [friendResult, customerResult] = await Promise.all([
          supabase
            .from<LineFriendRow>('line_friends')
            .select('id, store_id, customer_id, line_user_id, line_display_name, line_picture_url, line_status_message, friend_status, delivery_permission, blocked_at, followed_at, last_interaction_at, source_route, tag_names, internal_memo')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<CustomerRow>('customers')
            .select('id, name, phone, email')
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
        ]);

        if (friendResult.error) {
          throw new Error(friendResult.error.message);
        }

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        setFriends(friendResult.data ?? []);
        setCustomers(customerResult.data ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE友だち一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadFriends();
  }, [reloadKey]);

  const customerMap = useMemo(() => {
    return customers.reduce<Record<string, CustomerRow>>((map, customer) => {
      map[customer.id] = customer;
      return map;
    }, {});
  }, [customers]);

  const filteredFriends = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return friends.filter((friend) => {
      const customer = friend.customer_id ? customerMap[friend.customer_id] : null;
      const tagText = (friend.tag_names ?? []).join(' ').toLowerCase();
      const targetText = [
        friend.line_display_name,
        friend.line_user_id,
        customer?.name,
        customer?.phone,
        customer?.email,
        tagText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesKeyword = keyword === '' || targetText.includes(keyword);
      const matchesStatus = statusFilter === '' || friend.friend_status === statusFilter;
      const matchesPermission =
        permissionFilter === '' ||
        String(friend.delivery_permission === true) === permissionFilter;

      return matchesKeyword && matchesStatus && matchesPermission;
    });
  }, [customerMap, friends, permissionFilter, searchText, statusFilter]);

  const stats: StatItem[] = useMemo(
    () => [
      { label: '友だち数', value: String(friends.length) },
      { label: '配信許可数', value: String(friends.filter((friend) => friend.delivery_permission).length) },
      { label: 'ブロック数', value: String(friends.filter((friend) => friend.friend_status === 'blocked').length) },
      { label: '顧客紐付け済み数', value: String(friends.filter((friend) => friend.customer_id).length) },
    ],
    [friends]
  );

  function updateAddForm(field: keyof typeof emptyAddForm, value: string) {
    setAddForm((current) => ({ ...current, [field]: value }));
  }

  async function handleAddFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSaving(true);

    try {
      if (!storeId) {
        throw new Error('所属店舗が見つかりません。');
      }

      if (!addForm.line_user_id.trim()) {
        throw new Error('LINE userIdを入力してください。');
      }

      const supabase = createClient();
      const payload: LineFriendInsert = {
        store_id: storeId,
        customer_id: addForm.customer_id || null,
        line_user_id: addForm.line_user_id.trim(),
        line_display_name: addForm.line_display_name.trim() || null,
        friend_status: addForm.friend_status,
        delivery_permission: addForm.delivery_permission === 'true',
        tag_names: toTagArray(addForm.tag_names),
        internal_memo: addForm.internal_memo.trim() || null,
      };

      const { error } = await supabase.from<LineFriendInsert>('line_friends').insert(payload);

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage('LINE友だちを追加しました。');
      setAddForm(emptyAddForm);
      setShowAddForm(false);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'LINE友だちの追加に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <LineModuleShell
      title="友だち管理"
      description="LINE友だち・顧客紐付け・タグ・配信許可を管理します"
      actionButton={
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowAddForm((current) => !current)}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
          >
            友だちを手動追加
          </button>
          <Link href="/line/tags" className="rounded-xl border border-green-200 bg-white px-4 py-2 text-sm font-bold text-green-700 shadow-sm transition hover:bg-green-50">
            タグ管理へ
          </Link>
          <Link href="/line" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50">
            LINE管理へ戻る
          </Link>
        </div>
      }
    >
      <StatCards stats={stats} />

      {errorMessage && (
        <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="mb-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {successMessage}
        </p>
      )}

      {showAddForm && (
        <form onSubmit={handleAddFriend} className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">友だちを手動追加</h3>
            <p className="mt-1 text-sm text-slate-500">
              開発中はLINE Webhookの代わりに手動で登録できます。
            </p>
          </div>
          <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2">
            <div>
              <label htmlFor="line_display_name" className="mb-2 block text-sm font-bold text-slate-700">LINE表示名</label>
              <input id="line_display_name" value={addForm.line_display_name} onChange={(event) => updateAddForm('line_display_name', event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="line_user_id" className="mb-2 block text-sm font-bold text-slate-700">LINE userId</label>
              <input id="line_user_id" value={addForm.line_user_id} onChange={(event) => updateAddForm('line_user_id', event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="customer_id" className="mb-2 block text-sm font-bold text-slate-700">顧客選択</label>
              <select id="customer_id" value={addForm.customer_id} onChange={(event) => updateAddForm('customer_id', event.target.value)} className={inputClass}>
                <option value="">未紐付け</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name ?? '名称未設定'}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="friend_status" className="mb-2 block text-sm font-bold text-slate-700">友だち状態</label>
              <select id="friend_status" value={addForm.friend_status} onChange={(event) => updateAddForm('friend_status', event.target.value)} className={inputClass}>
                <option value="friend">友だち</option>
                <option value="blocked">ブロック</option>
                <option value="unknown">不明</option>
              </select>
            </div>
            <div>
              <label htmlFor="delivery_permission" className="mb-2 block text-sm font-bold text-slate-700">配信許可</label>
              <select id="delivery_permission" value={addForm.delivery_permission} onChange={(event) => updateAddForm('delivery_permission', event.target.value)} className={inputClass}>
                <option value="true">許可</option>
                <option value="false">不許可</option>
              </select>
            </div>
            <div>
              <label htmlFor="tag_names" className="mb-2 block text-sm font-bold text-slate-700">タグ</label>
              <input id="tag_names" value={addForm.tag_names} onChange={(event) => updateAddForm('tag_names', event.target.value)} placeholder="例：250cc希望, 購入検討中" className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="internal_memo" className="mb-2 block text-sm font-bold text-slate-700">社内メモ</label>
              <textarea id="internal_memo" rows={4} value={addForm.internal_memo} onChange={(event) => updateAddForm('internal_memo', event.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-5 sm:px-6">
            <button type="button" onClick={() => setShowAddForm(false)} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-green-50">
              キャンセル
            </button>
            <button type="submit" disabled={isSaving} className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:bg-slate-300">
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <button type="button" className="w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-700">
              フォルダ追加
            </button>
            <button type="button" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-green-50">
              並べ替え
            </button>
          </div>
          <nav className="space-y-1 p-3">
            {friendCategories.map((category, index) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                  selectedCategory === category ? 'bg-green-50 font-bold text-green-800 ring-1 ring-inset ring-green-100' : 'font-semibold text-slate-600 hover:bg-green-50'
                }`}
              >
                <span>{category}</span>
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                    {index === 0 ? friends.length : 0}
                  </span>
                  <span className="text-slate-400">...</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-950">友だち一覧</h3>
              <p className="mt-1 text-sm text-slate-500">LINE友だちと顧客情報の紐付け状況を確認できます。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowAddForm(true)} className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700">
                手動追加
              </button>
              <button type="button" className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800">
                CSV一括追加
              </button>
              <button type="button" className="rounded-xl border border-green-200 bg-white px-4 py-2.5 text-sm font-bold text-green-700 transition hover:bg-green-50">
                検索
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 lg:grid-cols-5">
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="LINE表示名・顧客名・タグで検索" className={`${inputClass} lg:col-span-3`} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}>
            <option value="">全ステータス</option>
            <option value="friend">友だち</option>
            <option value="blocked">ブロック</option>
            <option value="unknown">不明</option>
          </select>
          <select value={permissionFilter} onChange={(event) => setPermissionFilter(event.target.value)} className={inputClass}>
            <option value="">配信許可すべて</option>
            <option value="true">許可</option>
            <option value="false">不許可</option>
          </select>
        </div>

        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : filteredFriends.length === 0 && !errorMessage ? (
          <p className="p-5 text-sm font-semibold text-slate-500">
            LINE友だちはまだ登録されていません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label="全選択" />
                  </th>
                  <th className="px-5 py-4">LINE表示名</th>
                  <th className="px-5 py-4">顧客名</th>
                  <th className="px-5 py-4">友だち状態</th>
                  <th className="px-5 py-4">配信許可</th>
                  <th className="px-5 py-4">タグ</th>
                  <th className="px-5 py-4">流入経路</th>
                  <th className="px-5 py-4">最終反応日時</th>
                  <th className="px-5 py-4">詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFriends.map((friend) => {
                  const customer = friend.customer_id ? customerMap[friend.customer_id] : null;

                  return (
                    <tr key={friend.id} onClick={() => router.push(`/line/friends/${friend.id}`)} className="cursor-pointer hover:bg-green-50/60">
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label="選択" />
                      </td>
                      <td className="px-5 py-4 font-semibold">{displayValue(friend.line_display_name)}</td>
                      <td className="px-5 py-4">{displayValue(customer?.name)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(friend.friend_status)}`}>
                          {friendStatusLabel(friend.friend_status)}
                        </span>
                      </td>
                      <td className="px-5 py-4">{friend.delivery_permission ? '許可' : '不許可'}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(friend.tag_names ?? []).length > 0 ? (
                            friend.tag_names?.map((tag) => (
                              <span key={tag} className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-100">{tag}</span>
                            ))
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">{displayValue(friend.source_route)}</td>
                      <td className="px-5 py-4">{formatDateTime(friend.last_interaction_at)}</td>
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <Link href={`/line/friends/${friend.id}`} className="rounded-lg border border-green-200 bg-white px-3 py-2 text-xs font-bold text-green-700 transition hover:bg-green-50">
                          詳細
                        </Link>
                        <button type="button" className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-green-50">
                          ...
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </LineModuleShell>
  );
}
