'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { GARAGE_PLANS, getGaragePlan } from '@/lib/billing/garagePlans';
import { getRoleLabel } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  user_id: string | null;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type StoreRow = {
  id: string;
  name: string | null;
  company_name: string | null;
  tenant_id: string | null;
};

type PlanChangeRequestRow = {
  id: string;
  company_id: string;
  requested_by: string;
  request_type: string;
  current_plan: string | null;
  requested_plan: string | null;
  requested_extra_staff_count: number | null;
  requested_extra_store_count: number | null;
  requested_extra_storage_gb: number | null;
  support_hours: number | null;
  message: string | null;
  status: string;
  admin_note: string | null;
  completed_at: string | null;
  created_at: string | null;
};

const requestTypeLabels: Record<string, string> = {
  plan_change: 'プラン変更',
  add_staff: 'スタッフ追加',
  add_store: '店舗追加',
  add_storage: 'ストレージ追加',
  support: '個別サポート',
};

const statusLabels: Record<string, string> = {
  pending: '確認待ち',
  approved: '承認',
  rejected: '却下',
  completed: '完了',
};

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

function planLabel(value: string | null | undefined) {
  return value ? getGaragePlan(value).name : '-';
}

export default function AdminPlanRequestsPage() {
  const [role, setRole] = useState('');
  const [store, setStore] = useState<StoreRow | null>(null);
  const [members, setMembers] = useState<StoreMemberRow[]>([]);
  const [requests, setRequests] = useState<PlanChangeRequestRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  async function loadRequests() {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');

      const { data: member, error: memberError } = await supabase
        .from<StoreMemberRow>('store_members')
        .select('store_id, role, display_name, email')
        .eq('user_id', userData.user.id)
        .single();
      if (memberError || !member?.store_id) throw new Error('所属店舗が見つかりません。');
      setRole(member.role ?? '');

      const { data: storeData } = await supabase
        .from<StoreRow>('stores')
        .select('id, name, company_name, tenant_id')
        .eq('id', member.store_id)
        .single();
      setStore(storeData ?? { id: member.store_id, name: null, company_name: null, tenant_id: null });

      if (member.role !== 'owner' && member.role !== 'admin') {
        setRequests([]);
        return;
      }

      const { data: tenantStores } = storeData?.tenant_id
        ? await supabase.from<{ id: string }>('stores').select('id').eq('tenant_id', storeData.tenant_id)
        : { data: [{ id: member.store_id }] };
      const storeIds = (tenantStores ?? []).map((item) => item.id);
      const [membersResult, requestsResult] = await Promise.all([
        supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, user_id, role, display_name, email')
          .in('store_id', storeIds),
        supabase
          .from<PlanChangeRequestRow>('plan_change_requests')
          .select('id, company_id, requested_by, request_type, current_plan, requested_plan, requested_extra_staff_count, requested_extra_store_count, requested_extra_storage_gb, support_hours, message, status, admin_note, completed_at, created_at')
          .eq('tenant_id', storeData?.tenant_id)
          .order('created_at', { ascending: false }),
      ]);

      if (membersResult.error) throw new Error(membersResult.error.message);
      if (requestsResult.error) throw new Error(requestsResult.error.message);
      setMembers(membersResult.data ?? []);
      setRequests(requestsResult.data ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '申込一覧の取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const memberMap = useMemo(() => {
    return new Map(members.map((member) => [member.user_id, member]));
  }, [members]);

  return (
    <AppShell
      activeLabel="プラン・契約"
      title="プラン申込履歴"
      description="プラン変更、追加オプション、個別サポートの申込履歴を確認します。"
      actionButton={
        <Link href="/settings/billing" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          プラン・契約へ
        </Link>
      }
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</section>
      ) : role !== 'owner' && role !== 'admin' ? (
        <PermissionDeniedCard message="申込管理は店舗オーナー、管理者のみ利用できます。" backHref="/settings" />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
          <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
            現在の権限: {getRoleLabel(role)} / 対象会社: {store?.company_name || store?.name || '-'}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-lg font-bold text-slate-950">申込一覧</h3>
              <p className="mt-1 text-sm text-slate-500">契約内容の承認・反映は運営側の安全な処理で行います。この画面から契約を直接変更することはできません。</p>
            </div>
            <div className="overflow-x-auto p-5">
              <table className="w-full min-w-[1300px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    {['会社名', '申請者', '申込種別', '現在プラン', '希望プラン', '追加スタッフ', '追加店舗', '追加ストレージ', 'サポート時間', '備考', 'ステータス', '申請日', '完了反映日'].map((header) => (
                      <th key={header} className="px-4 py-3">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.length === 0 ? (
                    <tr><td colSpan={13} className="px-4 py-5 text-slate-500">申込はまだありません。</td></tr>
                  ) : requests.map((request) => {
                    const requester = memberMap.get(request.requested_by);
                    return (
                      <tr key={request.id} className="align-top hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold">{store?.company_name || store?.name || '-'}</td>
                        <td className="px-4 py-3">{requester?.display_name || requester?.email || request.requested_by.slice(0, 8)}</td>
                        <td className="px-4 py-3">{requestTypeLabels[request.request_type] ?? request.request_type}</td>
                        <td className="px-4 py-3">{planLabel(request.current_plan)}</td>
                        <td className="px-4 py-3">{request.requested_plan ? GARAGE_PLANS[request.requested_plan as keyof typeof GARAGE_PLANS]?.name ?? request.requested_plan : '-'}</td>
                        <td className="px-4 py-3">{request.requested_extra_staff_count ?? 0}名</td>
                        <td className="px-4 py-3">{request.requested_extra_store_count ?? 0}店舗</td>
                        <td className="px-4 py-3">{request.requested_extra_storage_gb ?? 0}GB</td>
                        <td className="px-4 py-3">{request.support_hours ?? 0}時間</td>
                        <td className="max-w-xs px-4 py-3">{request.message || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                            {statusLabels[request.status] ?? request.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{formatDateTime(request.created_at)}</td>
                        <td className="px-4 py-3">{formatDateTime(request.completed_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
