'use client';

import { useEffect, useState } from 'react';
import LinePageHeader from '@/components/line/shared/LinePageHeader';
import LinePackageShell from '@/components/line-package/LinePackageShell';
import LineStatusBadge from '@/components/line-package/LineStatusBadge';
import { createLinePackageAdapter, type LinePackageFriendListItem } from '@/lib/line/adapters/linePackageAdapter';
import { createLineTenantContext } from '@/lib/line/core/context';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type StoreRow = {
  tenant_id: string | null;
};

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

export default function LinePackageFriendsPage() {
  const [friends, setFriends] = useState<LinePackageFriendListItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();

        if (memberError || !member?.store_id) {
          throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
        }

        const { data: store } = await supabase
          .from<StoreRow>('stores')
          .select('tenant_id')
          .eq('id', member.store_id)
          .single();
        const context = createLineTenantContext({
          tenantId: store?.tenant_id ?? null,
          storeId: member.store_id,
          features: ['line'],
          role: member.role,
        });
        const adapter = createLinePackageAdapter(supabase);
        setFriends(await adapter.listFriends(context));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'LINE友だち一覧の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadFriends();
  }, []);

  return (
    <LinePackageShell
      title="友だち管理"
      description="LINE友だちの状態、タグ、最終反応日時を確認します。LINE userIdは表示しません。"
    >
      <section className="rounded-2xl border border-green-100 bg-white shadow-sm">
        <div className="border-b border-green-50 p-5">
          <LinePageHeader
            title="友だち一覧"
            description="表示名、ステータス、タグ数、最終反応日時のみを表示します。"
          />
        </div>
        {errorMessage && <p className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {isLoading ? (
          <p className="p-5 text-sm text-slate-500">読み込み中...</p>
        ) : friends.length === 0 ? (
          <p className="p-5 text-sm font-semibold text-slate-500">LINE友だちはまだ登録されていません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">表示名</th>
                  <th className="px-5 py-4">ステータス</th>
                  <th className="px-5 py-4">配信許可</th>
                  <th className="px-5 py-4">タグ数</th>
                  <th className="px-5 py-4">最終反応日時</th>
                  <th className="px-5 py-4">登録日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {friends.map((friend) => (
                  <tr key={friend.id} className="hover:bg-green-50/60">
                    <td className="px-5 py-4 font-semibold">{friend.displayName || '-'}</td>
                    <td className="px-5 py-4"><LineStatusBadge value={friend.status} /></td>
                    <td className="px-5 py-4">{friend.deliveryPermission === false ? '不許可' : '許可'}</td>
                    <td className="px-5 py-4">{friend.tagCount}</td>
                    <td className="px-5 py-4">{formatDateTime(friend.lastInteractionAt)}</td>
                    <td className="px-5 py-4">{formatDateTime(friend.createdAt)}</td>
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
