'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import ResponsiveDetailPanel from '@/components/ResponsiveDetailPanel';
import {
  buildTodayActionItems,
  getTodayActionCategoryLabel,
  getTodayActionStatusLabel,
  getTodayActionToneClass,
  type TodayActionAssignee,
  type TodayActionCategory,
  type TodayActionItem,
  type TodayActionStatus,
} from '@/lib/dashboard/todayActions';
import { createClient } from '@/lib/supabase/client';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
};

type VehicleRow = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  status: string | null;
  market_value: number | null;
  market_source: string | null;
  market_checked_at: string | null;
  purchase_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_archived?: boolean | null;
  deleted_at?: string | null;
};

type DealRow = {
  id: string;
  deal_no: string | null;
  title: string | null;
  status: string | null;
  assigned_user_name: string | null;
  next_action_at: string | null;
  vehicle_id: string | null;
  updated_at: string | null;
};

type MaintenanceRow = {
  id: string;
  reception_no: string | null;
  vehicle_id: string | null;
  job_type: string | null;
  status: string | null;
  scheduled_delivery_at: string | null;
  assigned_user_name: string | null;
  updated_at: string | null;
};

type AppointmentRow = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  appointment_type: string | null;
  scheduled_at: string;
  status: string | null;
  assigned_user_name: string | null;
  updated_at: string | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
};

type ListingStatusRow = {
  vehicle_id: string;
  channel: string;
  status: string;
};

type DashboardState = {
  vehicles: VehicleRow[];
  deals: DealRow[];
  maintenanceJobs: MaintenanceRow[];
  appointments: AppointmentRow[];
  customers: CustomerRow[];
  listingStatuses: ListingStatusRow[];
};

type EditableActionKind = 'appointment' | 'deal' | 'maintenance';

const emptyState: DashboardState = {
  vehicles: [],
  deals: [],
  maintenanceJobs: [],
  appointments: [],
  customers: [],
  listingStatuses: [],
};

const inputClass = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
const STATUS_OPTIONS: Array<{ value: '' | TodayActionStatus; label: string }> = [
  { value: '', label: 'すべて' },
  { value: 'urgent', label: '緊急' },
  { value: 'today', label: '今日' },
  { value: 'scheduled', label: '予定' },
];
const ASSIGNEE_OPTIONS: Array<{ value: TodayActionAssignee; label: string }> = [
  { value: 'all', label: '全員' },
  { value: 'mine', label: '自分' },
  { value: 'unassigned', label: '未割当' },
];
const CATEGORY_OPTIONS: Array<{ value: '' | TodayActionCategory; label: string }> = [
  { value: '', label: 'すべて' },
  { value: 'appointment', label: '来店・試乗予約' },
  { value: 'deal', label: '商談' },
  { value: 'maintenance', label: '整備・車検' },
  { value: 'listing', label: '掲載・相場' },
  { value: 'inventory', label: '在庫' },
];
const APPOINTMENT_STATUSES = ['予約済み', '確認済み', '完了', 'キャンセル', '無断キャンセル'];
const DEAL_STATUSES = ['新規', '連絡済み', '見積済み', '来店予定', '商談中', '成約', '失注'];
const MAINTENANCE_STATUSES = ['受付', '見積待ち', '作業中', '部品待ち', '完了', '納車済み'];

function dateKeyJst(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function formatDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 16) : '';
}

function vehicleLabel(vehicle: VehicleRow | undefined) {
  if (!vehicle) return '-';
  const label = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return label || vehicle.management_no || '-';
}

function parseActionId(actionId: string): { kind: TodayActionCategory; entityId: string } {
  const [kind, ...rest] = actionId.split('-');
  return { kind: kind as TodayActionCategory, entityId: rest.join('-') };
}

function isEditableCategory(category: TodayActionCategory): category is EditableActionKind {
  return category === 'appointment' || category === 'deal' || category === 'maintenance';
}

function TodayActionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<DashboardState>(emptyState);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [role, setRole] = useState('');
  const [memberDisplayName, setMemberDisplayName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [longStayThreshold, setLongStayThreshold] = useState(90);
  const [statusFilter, setStatusFilter] = useState<'' | TodayActionStatus>((searchParams.get('status') as '' | TodayActionStatus) || '');
  const [assigneeFilter, setAssigneeFilter] = useState<TodayActionAssignee>((searchParams.get('assignee') as TodayActionAssignee) || 'all');
  const [categoryFilter, setCategoryFilter] = useState<'' | TodayActionCategory>((searchParams.get('category') as '' | TodayActionCategory) || '');
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState('');
  const [editingDateTime, setEditingDateTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const todayKey = dateKeyJst(new Date());

  const loadSummary = useCallback(async (preserveLoading = false) => {
    if (!preserveLoading) setIsLoading(true);
    setErrorMessage('');
    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.id) throw new Error(userError?.message ?? 'ログイン情報を取得できませんでした。');

      const { data: member, error: memberError } = await supabase
        .from<StoreMemberRow>('store_members')
        .select('store_id, role, display_name')
        .eq('user_id', userData.user.id)
        .single();

      if (memberError || !member?.store_id) throw new Error(memberError?.message ?? '所属店舗が見つかりません。');

      setStoreId(member.store_id);
      setRole(member.role ?? '');
      setMemberDisplayName(member.display_name ?? '');

      const [vehicles, deals, maintenanceJobs, appointments, customers, listingStatuses, storeResult] = await Promise.all([
        supabase
          .from<VehicleRow>('vehicles')
          .select('id, management_no, maker, model_name, status, market_value, market_source, market_checked_at, purchase_date, created_at, updated_at, is_archived, deleted_at')
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false }),
        supabase
          .from<DealRow>('deals')
          .select('id, deal_no, title, status, assigned_user_name, next_action_at, vehicle_id, updated_at')
          .eq('store_id', member.store_id)
          .order('created_at', { ascending: false }),
        supabase
          .from<MaintenanceRow>('maintenance_jobs')
          .select('id, reception_no, vehicle_id, job_type, status, scheduled_delivery_at, assigned_user_name, updated_at')
          .eq('store_id', member.store_id)
          .order('scheduled_delivery_at', { ascending: true }),
        supabase
          .from<AppointmentRow>('appointments')
          .select('id, customer_id, vehicle_id, appointment_type, scheduled_at, status, assigned_user_name, updated_at')
          .eq('store_id', member.store_id)
          .order('scheduled_at', { ascending: true }),
        supabase.from<CustomerRow>('customers').select('id, name').eq('store_id', member.store_id),
        supabase.from<ListingStatusRow>('vehicle_listing_statuses').select('vehicle_id, channel, status').eq('store_id', member.store_id),
        supabase.from<{ long_stay_threshold_days: number | null }>('stores').select('long_stay_threshold_days').eq('id', member.store_id).single(),
      ]);

      setSummary({
        vehicles: vehicles.data ?? [],
        deals: deals.data ?? [],
        maintenanceJobs: maintenanceJobs.data ?? [],
        appointments: appointments.data ?? [],
        customers: customers.data ?? [],
        listingStatuses: listingStatuses.data ?? [],
      });
      setLongStayThreshold(storeResult.data?.long_stay_threshold_days ?? 90);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '今日やること一覧の取得に失敗しました。');
    } finally {
      if (!preserveLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (assigneeFilter !== 'all') params.set('assignee', assigneeFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (keyword.trim()) params.set('q', keyword.trim());
    const query = params.toString();
    router.replace(query ? `/dashboard/today-actions?${query}` : '/dashboard/today-actions', { scroll: false });
  }, [assigneeFilter, categoryFilter, keyword, router, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSummary();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

  const items = useMemo(
    () => buildTodayActionItems({
      appointments: summary.appointments,
      deals: summary.deals,
      maintenanceJobs: summary.maintenanceJobs,
      vehicles: summary.vehicles,
      listingStatuses: summary.listingStatuses,
      customers: summary.customers,
      todayKey,
      memberRole: role,
      memberDisplayName,
      longStayThresholdDays: longStayThreshold,
    }),
    [longStayThreshold, memberDisplayName, role, summary, todayKey],
  );

  const filteredItems = useMemo(() => {
    const keywordValue = keyword.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (assigneeFilter === 'mine' && item.assigneeName !== memberDisplayName) return false;
      if (assigneeFilter === 'unassigned' && item.assigneeName) return false;
      if (keywordValue && !`${item.title} ${item.detail} ${item.searchText}`.toLowerCase().includes(keywordValue)) return false;
      return true;
    });
  }, [assigneeFilter, categoryFilter, items, keyword, memberDisplayName, statusFilter]);

  const urgentCount = items.filter((item) => item.status === 'urgent').length;
  const selectedAction = useMemo(
    () => items.find((item) => item.id === selectedActionId) ?? null,
    [items, selectedActionId],
  );
  const selectedMeta = useMemo(() => (selectedAction ? parseActionId(selectedAction.id) : null), [selectedAction]);
  const selectedAppointment = useMemo(
    () => selectedMeta?.kind === 'appointment' ? summary.appointments.find((item) => item.id === selectedMeta.entityId) ?? null : null,
    [selectedMeta, summary.appointments],
  );
  const selectedDeal = useMemo(
    () => selectedMeta?.kind === 'deal' ? summary.deals.find((item) => item.id === selectedMeta.entityId) ?? null : null,
    [selectedMeta, summary.deals],
  );
  const selectedMaintenance = useMemo(
    () => selectedMeta?.kind === 'maintenance' ? summary.maintenanceJobs.find((item) => item.id === selectedMeta.entityId) ?? null : null,
    [selectedMeta, summary.maintenanceJobs],
  );
  const vehicleMap = useMemo(() => new Map(summary.vehicles.map((item) => [item.id, item])), [summary.vehicles]);
  const customerMap = useMemo(() => new Map(summary.customers.map((item) => [item.id, item])), [summary.customers]);

  const openActionPanel = useCallback((action: TodayActionItem) => {
    setSelectedActionId(action.id);
    setPendingRefresh(false);
    setConflictMessage('');
    const meta = parseActionId(action.id);
    if (meta.kind === 'appointment') {
      const row = summary.appointments.find((item) => item.id === meta.entityId);
      setEditingStatus(row?.status ?? '');
      setEditingDateTime('');
      return;
    }
    if (meta.kind === 'deal') {
      const row = summary.deals.find((item) => item.id === meta.entityId);
      setEditingStatus(row?.status ?? '');
      setEditingDateTime(formatDateInput(row?.next_action_at));
      return;
    }
    if (meta.kind === 'maintenance') {
      const row = summary.maintenanceJobs.find((item) => item.id === meta.entityId);
      setEditingStatus(row?.status ?? '');
      setEditingDateTime(formatDateInput(row?.scheduled_delivery_at));
      return;
    }
    setEditingStatus('');
    setEditingDateTime('');
  }, [summary.appointments, summary.deals, summary.maintenanceJobs]);

  useEffect(() => {
    if (!selectedMeta || !isEditableCategory(selectedMeta.kind) || !storeId) return undefined;
    const timer = window.setInterval(async () => {
      const supabase = createClient();
      if (selectedMeta.kind === 'appointment' && selectedAppointment) {
        const { data } = await supabase.from<AppointmentRow>('appointments').select('id, updated_at').eq('store_id', storeId).eq('id', selectedAppointment.id).maybeSingle();
        if (data?.updated_at && data.updated_at !== selectedAppointment.updated_at) setPendingRefresh(true);
      }
      if (selectedMeta.kind === 'deal' && selectedDeal) {
        const { data } = await supabase.from<DealRow>('deals').select('id, updated_at').eq('store_id', storeId).eq('id', selectedDeal.id).maybeSingle();
        if (data?.updated_at && data.updated_at !== selectedDeal.updated_at) setPendingRefresh(true);
      }
      if (selectedMeta.kind === 'maintenance' && selectedMaintenance) {
        const { data } = await supabase.from<MaintenanceRow>('maintenance_jobs').select('id, updated_at').eq('store_id', storeId).eq('id', selectedMaintenance.id).maybeSingle();
        if (data?.updated_at && data.updated_at !== selectedMaintenance.updated_at) setPendingRefresh(true);
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [selectedAppointment, selectedDeal, selectedMaintenance, selectedMeta, storeId]);

  const applyRefresh = useCallback(async () => {
    await loadSummary(true);
    setPendingRefresh(false);
    setConflictMessage('');
  }, [loadSummary]);

  const savePanel = useCallback(async () => {
    if (!selectedMeta || !storeId) return;
    setIsSaving(true);
    setConflictMessage('');
    try {
      const supabase = createClient();

      if (selectedMeta.kind === 'appointment' && selectedAppointment) {
        const payload = {
          status: editingStatus || null,
          no_show_reason: editingStatus === '無断キャンセル' ? '来店なし' : null,
          completed_at: editingStatus === '完了' ? new Date().toISOString() : null,
        };
        const { data, error } = await supabase
          .from<AppointmentRow>('appointments')
          .update(payload)
          .eq('store_id', storeId)
          .eq('id', selectedAppointment.id)
          .eq('updated_at', selectedAppointment.updated_at ?? '')
          .select('id, customer_id, vehicle_id, appointment_type, scheduled_at, status, assigned_user_name, updated_at')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          setConflictMessage('他のスタッフが先に更新しました。内容を反映してからやり直してください。');
          setPendingRefresh(true);
          return;
        }
      }

      if (selectedMeta.kind === 'deal' && selectedDeal) {
        const payload = {
          status: editingStatus || null,
          next_action_at: editingDateTime ? new Date(editingDateTime).toISOString() : null,
        };
        const { data, error } = await supabase
          .from<DealRow>('deals')
          .update(payload)
          .eq('store_id', storeId)
          .eq('id', selectedDeal.id)
          .eq('updated_at', selectedDeal.updated_at ?? '')
          .select('id, deal_no, title, status, assigned_user_name, next_action_at, vehicle_id, updated_at')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          setConflictMessage('他のスタッフが先に更新しました。内容を反映してからやり直してください。');
          setPendingRefresh(true);
          return;
        }
      }

      if (selectedMeta.kind === 'maintenance' && selectedMaintenance) {
        const payload = {
          status: editingStatus || null,
          scheduled_delivery_at: editingDateTime ? new Date(editingDateTime).toISOString() : null,
        };
        const { data, error } = await supabase
          .from<MaintenanceRow>('maintenance_jobs')
          .update(payload)
          .eq('store_id', storeId)
          .eq('id', selectedMaintenance.id)
          .eq('updated_at', selectedMaintenance.updated_at ?? '')
          .select('id, reception_no, vehicle_id, job_type, status, scheduled_delivery_at, assigned_user_name, updated_at')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) {
          setConflictMessage('他のスタッフが先に更新しました。内容を反映してからやり直してください。');
          setPendingRefresh(true);
          return;
        }
      }

      await loadSummary(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }, [editingDateTime, editingStatus, loadSummary, selectedAppointment, selectedDeal, selectedMaintenance, selectedMeta, storeId]);

  return (
    <AppShell activeLabel="ダッシュボード" title="今日やること一覧" description="期限超過、当日対応、掲載・在庫の確認事項をまとめて見ます。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="text-sm font-black text-blue-700 hover:underline">← ダッシュボードに戻る</Link>
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">緊急 {urgentCount}件</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">全{items.length}件</span>
          {pendingRefresh && (
            <button type="button" onClick={() => void applyRefresh()} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
              新しい更新があります。反映する
            </button>
          )}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              状態
              <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | TodayActionStatus)}>
                {STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              担当
              <select className={inputClass} value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value as TodayActionAssignee)}>
                {ASSIGNEE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              種類
              <select className={inputClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as '' | TodayActionCategory)}>
                {CATEGORY_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              キーワード
              <input className={inputClass} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="車名・担当者・案件名" />
            </label>
          </div>
        </section>

        {errorMessage && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage}</p>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-black text-slate-950">一覧</p>
              <p className="mt-1 text-sm text-slate-500">スタッフ権限では、自分担当と未割当の緊急のみ表示します。</p>
            </div>

            {isLoading ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">読み込み中...</p>
            ) : filteredItems.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-slate-500">条件に合う項目はありません。</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const selected = item.id === selectedActionId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openActionPanel(item)}
                      className={`block w-full px-5 py-4 text-left transition hover:opacity-90 ${getTodayActionToneClass(item.tone)} ${selected ? 'ring-2 ring-blue-200' : ''}`}
                    >
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-black text-slate-700">{getTodayActionStatusLabel(item.status)}</span>
                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-black text-slate-700">{getTodayActionCategoryLabel(item.category)}</span>
                          </div>
                          <p className="mt-2 text-sm font-black text-slate-950">{item.title}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{item.detail}</p>
                        </div>
                        <div className="text-xs font-bold text-slate-500">
                          {item.assigneeName ? `担当 ${item.assigneeName}` : '未割当'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <ResponsiveDetailPanel
            open={Boolean(selectedAction)}
            title={selectedAction?.title ?? '対応概要'}
            subtitle={selectedAction?.detail}
            onClose={() => {
              setSelectedActionId(null);
              setPendingRefresh(false);
              setConflictMessage('');
            }}
          >
            {selectedAction && (
              <div className="space-y-4">
                {pendingRefresh && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    他の更新があります。保存前に反映してください。
                  </div>
                )}
                {conflictMessage && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
                    {conflictMessage}
                  </div>
                )}

                {selectedAppointment && (
                  <>
                    <dl className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">顧客</dt><dd className="font-bold text-slate-900">{selectedAppointment.customer_id ? customerMap.get(selectedAppointment.customer_id)?.name ?? '-' : '-'}</dd></div>
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">対象車両</dt><dd className="font-bold text-slate-900">{selectedAppointment.vehicle_id ? vehicleLabel(vehicleMap.get(selectedAppointment.vehicle_id)) : '-'}</dd></div>
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">予定日時</dt><dd className="font-bold text-slate-900">{formatDateTime(selectedAppointment.scheduled_at)}</dd></div>
                    </dl>
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold text-slate-500">状態変更</span>
                      <select className={`${inputClass} w-full`} value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)}>
                        {APPOINTMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    <button type="button" onClick={() => void savePanel()} disabled={isSaving || pendingRefresh} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">
                      {isSaving ? '保存中...' : 'この内容で保存する'}
                    </button>
                    <Link href="/appointments" className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">予約一覧を開く</Link>
                  </>
                )}

                {selectedDeal && (
                  <>
                    <dl className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">案件名</dt><dd className="font-bold text-right text-slate-900">{selectedDeal.title ?? selectedDeal.deal_no ?? '-'}</dd></div>
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">対象車両</dt><dd className="font-bold text-slate-900">{selectedDeal.vehicle_id ? vehicleLabel(vehicleMap.get(selectedDeal.vehicle_id)) : '-'}</dd></div>
                    </dl>
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold text-slate-500">ステータス</span>
                      <select className={`${inputClass} w-full`} value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)}>
                        <option value="">未設定</option>
                        {DEAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold text-slate-500">次回対応日</span>
                      <input type="datetime-local" className={`${inputClass} w-full`} value={editingDateTime} onChange={(event) => setEditingDateTime(event.target.value)} />
                    </label>
                    <button type="button" onClick={() => void savePanel()} disabled={isSaving || pendingRefresh} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">
                      {isSaving ? '保存中...' : 'この内容で保存する'}
                    </button>
                    <Link href={`/deals/${selectedDeal.id}`} className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">詳細ページを開く</Link>
                  </>
                )}

                {selectedMaintenance && (
                  <>
                    <dl className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">案件</dt><dd className="font-bold text-right text-slate-900">{selectedMaintenance.reception_no ?? '-'}</dd></div>
                      <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">対象車両</dt><dd className="font-bold text-slate-900">{selectedMaintenance.vehicle_id ? vehicleLabel(vehicleMap.get(selectedMaintenance.vehicle_id)) : '-'}</dd></div>
                    </dl>
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold text-slate-500">状態</span>
                      <select className={`${inputClass} w-full`} value={editingStatus} onChange={(event) => setEditingStatus(event.target.value)}>
                        <option value="">未設定</option>
                        {MAINTENANCE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold text-slate-500">納車予定</span>
                      <input type="datetime-local" className={`${inputClass} w-full`} value={editingDateTime} onChange={(event) => setEditingDateTime(event.target.value)} />
                    </label>
                    <button type="button" onClick={() => void savePanel()} disabled={isSaving || pendingRefresh} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300">
                      {isSaving ? '保存中...' : 'この内容で保存する'}
                    </button>
                    <Link href={`/maintenance/${selectedMaintenance.id}`} className="block rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700">詳細ページを開く</Link>
                  </>
                )}

                {selectedMeta && (selectedMeta.kind === 'listing' || selectedMeta.kind === 'inventory') && (
                  <>
                    <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
                      この項目は一覧上での即時更新は行わず、車両詳細で確認・更新します。
                    </div>
                    <Link href={selectedAction.href} className="block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white">対象画面を開く</Link>
                  </>
                )}
              </div>
            )}
          </ResponsiveDetailPanel>
        </div>
      </div>
    </AppShell>
  );
}

export default function TodayActionsPage() {
  return (
    <Suspense fallback={<AppShell activeLabel="ダッシュボード" title="今日やること一覧" description="期限超過、当日対応、掲載・在庫の確認事項をまとめて見ます。"><div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500 shadow-sm">読み込み中...</div></AppShell>}>
      <TodayActionsPageContent />
    </Suspense>
  );
}
