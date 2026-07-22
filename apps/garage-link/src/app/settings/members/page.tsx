'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { logAudit } from '@/lib/audit/logAudit';
import { canAddStaff, formatGarageYen } from '@/lib/billing/garagePlans';
import { getActiveCompanySubscription, type CompanySubscriptionRow } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  id: string;
  store_id: string;
  user_id: string | null;
  role: string | null;
  display_name: string | null;
  email: string | null;
  status: string | null;
  invited_at: string | null;
  joined_at: string | null;
  last_login_at: string | null;
  memo: string | null;
};

type MemberFormRow = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  joined_at: string;
  last_login_at: string;
  memo: string;
};

type NewMemberForm = {
  email: string;
  display_name: string;
  role: string;
  memo: string;
};

type MemberInsert = {
  store_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  role: string;
  status: string;
  invited_at: string;
  memo: string | null;
};

type MemberUpdate = {
  display_name: string | null;
  role: string;
  status: string;
  memo: string | null;
};

const allowedViewRoles = ['owner', 'admin'];
const editableRoles = ['owner', 'admin'];
const roleOptions = ['owner', 'admin', 'implementer', 'staff', 'viewer'];
const addRoleOptions = ['admin', 'implementer', 'staff', 'viewer'];
const statusOptions = ['active', 'invited', 'suspended'];

const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  admin: '管理者',
  implementer: '構築担当者',
  staff: 'スタッフ',
  viewer: '閲覧のみ',
};

const statusLabels: Record<string, string> = {
  active: '有効',
  invited: '招待中',
  suspended: '停止中',
};

const roleDescriptions = [
  ['owner', '全操作可能。契約・設定・エクスポート管理。'],
  ['admin', '店舗管理、スタッフ管理、通常設定が可能。'],
  ['implementer', 'LINE構築、テンプレート、フォーム、シナリオ、設定移行が可能。'],
  ['staff', '日常業務、顧客、車両、商談、整備の操作が可能。'],
  ['viewer', '閲覧のみ。'],
];

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';
const tableInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';

const emptyNewMember: NewMemberForm = {
  email: '',
  display_name: '',
  role: 'staff',
  memo: '',
};

function displayValue(value: string | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 16) : '-';
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function roleBadgeClass(role: string) {
  switch (role) {
    case 'owner':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
    case 'admin':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'implementer':
      return 'bg-purple-50 text-purple-700 ring-purple-600/20';
    case 'viewer':
      return 'bg-slate-100 text-slate-700 ring-slate-600/20';
    default:
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'active':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case 'suspended':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
  }
}

function mapMember(row: StoreMemberRow): MemberFormRow {
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    display_name: row.display_name ?? '',
    email: row.email ?? '',
    role: row.role ?? 'staff',
    status: row.status ?? 'active',
    invited_at: row.invited_at ?? '',
    joined_at: row.joined_at ?? '',
    last_login_at: row.last_login_at ?? '',
    memo: row.memo ?? '',
  };
}

export default function MemberSettingsPage() {
  const [storeId, setStoreId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState('');
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<CompanySubscriptionRow | null>(null);
  const [contractStaffCount, setContractStaffCount] = useState(0);
  const [members, setMembers] = useState<MemberFormRow[]>([]);
  const [newMember, setNewMember] = useState<NewMemberForm>(emptyNewMember);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canView = allowedViewRoles.includes(currentRole);
  const canEdit = editableRoles.includes(currentRole);
  const activeCount = useMemo(() => members.filter((member) => member.status === 'active').length, [members]);
  const invitedCount = useMemo(() => members.filter((member) => member.status === 'invited').length, [members]);

  function updateMember(id: string, key: keyof MemberFormRow, value: string) {
    setMembers((current) => current.map((member) => member.id === id ? { ...member, [key]: value } : member));
  }

  function updateNewMember(key: keyof NewMemberForm, value: string) {
    setNewMember((current) => ({ ...current, [key]: value }));
  }

  async function loadMembers() {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) throw new Error('ログイン情報を取得できませんでした。');
      setCurrentUserId(userData.user.id);
      setCurrentUserEmail(userData.user.email ?? null);

      const { data: currentMember, error: currentMemberError } = await supabase
        .from<StoreMemberRow>('store_members')
        .select('id, store_id, user_id, role, display_name, email, status, invited_at, joined_at, last_login_at, memo')
        .eq('user_id', userData.user.id)
        .single();
      if (currentMemberError || !currentMember?.store_id) throw new Error('所属店舗が見つかりません。');

      setStoreId(currentMember.store_id);
      setCurrentRole(currentMember.role ?? '');
      setCurrentDisplayName(currentMember.display_name);
      const subscriptionData = await getActiveCompanySubscription(supabase, currentMember.store_id);
      setSubscription(subscriptionData);
      const { data: usageData } = await supabase.rpc('get_garage_plan_usage', {
        p_store_id: currentMember.store_id,
      });
      setContractStaffCount(Number((usageData as { staff_count?: number } | null)?.staff_count ?? 0));

      if (!allowedViewRoles.includes(currentMember.role ?? '')) {
        setMembers([]);
        return;
      }

      const { data, error } = await supabase
        .from<StoreMemberRow>('store_members')
        .select('id, store_id, user_id, role, display_name, email, status, invited_at, joined_at, last_login_at, memo')
        .eq('store_id', currentMember.store_id)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      setMembers((data ?? []).map(mapMember));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'メンバー情報の取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMembers();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleAddMember() {
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');
      if (!canEdit) throw new Error('メンバーを追加する権限がありません。');
      if (!storeId) throw new Error('所属店舗が見つかりません。');
      if (!newMember.email.trim()) throw new Error('メールアドレスを入力してください。');
      if (!canAddStaff(subscription)) {
        throw new Error('Freeプランではスタッフ追加はできません。プラン変更をご検討ください。');
      }
      const staffLimit = (subscription?.included_staff_count ?? 1) + (subscription?.extra_staff_count ?? 0);
      if (contractStaffCount >= staffLimit) {
        throw new Error(`契約全店舗のスタッフ上限（${staffLimit}名）に達しています。プラン・契約から追加スタッフをお申し込みください。`);
      }

      const supabase = createClient();
      const payload: MemberInsert = {
        store_id: storeId,
        user_id: null,
        email: newMember.email.trim(),
        display_name: toNullableText(newMember.display_name),
        role: newMember.role,
        status: 'invited',
        invited_at: new Date().toISOString(),
        memo: toNullableText(newMember.memo),
      };
      const { error } = await supabase.from<MemberInsert>('store_members').insert(payload);
      if (error) throw new Error(error.message);

      await logAudit({
        supabase,
        storeId,
        userId: currentUserId,
        userEmail: currentUserEmail,
        userRole: currentRole,
        userDisplayName: currentDisplayName,
        action: 'create',
        targetType: 'store_member',
        targetLabel: newMember.email.trim(),
        afterData: {
          email: newMember.email.trim(),
          display_name: newMember.display_name,
          role: newMember.role,
          status: 'invited',
        },
      });

      setNewMember(emptyNewMember);
      setSuccessMessage('メンバー予定者を追加しました。招待メール送信は次工程で実装します。');
      await loadMembers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'メンバー追加に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveMember(member: MemberFormRow) {
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');
      if (!canEdit) throw new Error('メンバーを編集する権限がありません。');
      if (member.user_id === currentUserId && currentRole === 'owner' && member.role !== 'owner') {
        throw new Error('オーナー自身の権限はこの画面では下げられません。');
      }
      if (member.role === 'viewer' && member.user_id === currentUserId) {
        throw new Error('自分自身の権限を閲覧のみに変更することはできません。');
      }

      const supabase = createClient();
      const beforeMember = members.find((item) => item.id === member.id);
      const payload: MemberUpdate = {
        display_name: toNullableText(member.display_name),
        role: member.role,
        status: member.status,
        memo: toNullableText(member.memo),
      };
      const { error } = await supabase
        .from<MemberUpdate>('store_members')
        .update(payload)
        .eq('id', member.id)
        .eq('store_id', storeId);
      if (error) throw new Error(error.message);

      await logAudit({
        supabase,
        storeId,
        userId: currentUserId,
        userEmail: currentUserEmail,
        userRole: currentRole,
        userDisplayName: currentDisplayName,
        action: 'change_role',
        targetType: 'store_member',
        targetId: member.id,
        targetLabel: member.email || member.display_name,
        beforeData: beforeMember ? {
          display_name: beforeMember.display_name,
          role: beforeMember.role,
          status: beforeMember.status,
          memo: beforeMember.memo,
        } : null,
        afterData: {
          display_name: member.display_name,
          role: member.role,
          status: member.status,
          memo: member.memo,
        },
      });

      setSuccessMessage('メンバー情報を保存しました。');
      await loadMembers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'メンバー情報の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      activeLabel="メンバー・権限設定"
      title="メンバー・権限設定"
      description="店舗スタッフ、構築担当者、管理者の権限を管理します。"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}
        {successMessage && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{successMessage}</p>}

        {isLoading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">読み込み中...</p>
        ) : !canView ? (
          <PermissionDeniedCard backHref="/settings" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">メンバー数</p>
                <p className="mt-3 text-3xl font-bold">{members.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">有効</p>
                <p className="mt-3 text-3xl font-bold text-green-700">{activeCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">招待中</p>
                <p className="mt-3 text-3xl font-bold text-blue-700">{invitedCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-500">自分の権限</p>
                <p className="mt-3 text-xl font-bold">{roleLabels[currentRole] ?? displayValue(currentRole)}</p>
              </div>
            </div>

            <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-950">スタッフ追加のプラン制限</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Freeプランではスタッフ追加はできません。Starter以上では追加スタッフ {formatGarageYen(1000)}/月・名 で申し込めます。
              </p>
              {!canAddStaff(subscription) && (
                <Link href="/settings/billing" className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                  プラン変更を申し込む
                </Link>
              )}
            </section>

            {canEdit ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="text-lg font-bold text-slate-950">メンバー追加</h3>
                <p className="mt-1 text-sm text-slate-500">Supabase Authへの招待メール送信はまだ行わず、店舗内メンバー予定者として登録します。</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className="text-sm font-bold text-slate-700">メールアドレス</span>
                    <input type="email" className={`${inputClass} mt-2`} value={newMember.email} onChange={(event) => updateNewMember('email', event.target.value)} />
                  </label>
                  <label>
                    <span className="text-sm font-bold text-slate-700">表示名</span>
                    <input className={`${inputClass} mt-2`} value={newMember.display_name} onChange={(event) => updateNewMember('display_name', event.target.value)} />
                  </label>
                  <label>
                    <span className="text-sm font-bold text-slate-700">権限</span>
                    <select className={`${inputClass} mt-2`} value={newMember.role} onChange={(event) => updateNewMember('role', event.target.value)}>
                      {addRoleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </select>
                  </label>
                  <label className="md:col-span-2 xl:col-span-1">
                    <span className="text-sm font-bold text-slate-700">メモ</span>
                    <input className={`${inputClass} mt-2`} value={newMember.memo} onChange={(event) => updateNewMember('memo', event.target.value)} />
                  </label>
                </div>
                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={() => void handleAddMember()} disabled={isSaving || !canAddStaff(subscription)} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                    メンバーを追加
                  </button>
                </div>
              </section>
            ) : (
              <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">構築担当者は閲覧のみ可能です。メンバーの追加・編集はオーナーまたは管理者に依頼してください。</p>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
                <h3 className="text-lg font-bold text-slate-950">メンバー一覧</h3>
                <p className="mt-1 text-sm text-slate-500">所属店舗のメンバーと招待予定者を管理します。</p>
              </div>
              <div className="overflow-x-auto p-5">
                <table className="w-full min-w-[1280px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                    <tr>
                      {['表示名','メールアドレス','権限','ステータス','招待日時','参加日時','最終ログイン','メモ','操作'].map((header) => <th key={header} className="px-3 py-3">{header}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.length === 0 ? (
                      <tr><td className="px-3 py-5 text-slate-500" colSpan={9}>メンバーはまだ登録されていません。</td></tr>
                    ) : members.map((member) => {
                      const isCurrentUser = member.user_id === currentUserId;
                      const isOwner = member.role === 'owner';
                      const roleSelectOptions = isOwner ? ['owner'] : roleOptions;
                      return (
                        <tr key={member.id} className="hover:bg-slate-50">
                          <td className="px-3 py-3"><input disabled={!canEdit} className={tableInputClass} value={member.display_name} onChange={(event) => updateMember(member.id, 'display_name', event.target.value)} /></td>
                          <td className="px-3 py-3 font-semibold text-slate-700">{displayValue(member.email)}</td>
                          <td className="px-3 py-3">
                            <select disabled={!canEdit || isOwner} className={tableInputClass} value={member.role} onChange={(event) => updateMember(member.id, 'role', event.target.value)}>
                              {roleSelectOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                            </select>
                            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${roleBadgeClass(member.role)}`}>
                              {roleLabels[member.role] ?? member.role}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <select disabled={!canEdit} className={tableInputClass} value={member.status} onChange={(event) => updateMember(member.id, 'status', event.target.value)}>
                              {statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                            </select>
                            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusBadgeClass(member.status)}`}>
                              {statusLabels[member.status] ?? member.status}
                            </span>
                          </td>
                          <td className="px-3 py-3">{formatDateTime(member.invited_at)}</td>
                          <td className="px-3 py-3">{formatDateTime(member.joined_at)}</td>
                          <td className="px-3 py-3">{formatDateTime(member.last_login_at)}</td>
                          <td className="px-3 py-3"><input disabled={!canEdit} className={tableInputClass} value={member.memo} onChange={(event) => updateMember(member.id, 'memo', event.target.value)} /></td>
                          <td className="px-3 py-3">
                            {isCurrentUser && <p className="mb-2 text-xs font-semibold text-amber-700">自分自身の権限変更に注意</p>}
                            <button type="button" disabled={!canEdit || isSaving} onClick={() => void handleSaveMember(member)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:bg-slate-300">
                              保存
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h3 className="text-lg font-bold text-slate-950">権限説明</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {roleDescriptions.map(([role, description]) => (
                  <div key={role} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${roleBadgeClass(role)}`}>{roleLabels[role]}</span>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
