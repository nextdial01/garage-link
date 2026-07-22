'use client';

export type AttentionTone = 'red' | 'amber' | 'blue';
export type TodayActionCategory = 'appointment' | 'deal' | 'maintenance' | 'listing' | 'inventory';
export type TodayActionStatus = 'urgent' | 'today' | 'scheduled';
export type TodayActionAssignee = 'mine' | 'unassigned' | 'all';

export type DashboardActionAppointment = {
  id: string;
  appointment_type: string | null;
  scheduled_at: string;
  status: string | null;
  assigned_user_name: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
};

export type DashboardActionDeal = {
  id: string;
  deal_no: string | null;
  title: string | null;
  status: string | null;
  assigned_user_name: string | null;
  next_action_at: string | null;
  vehicle_id?: string | null;
};

export type DashboardActionMaintenance = {
  id: string;
  reception_no?: string | null;
  job_no?: string | null;
  job_type: string | null;
  status: string | null;
  scheduled_delivery_at: string | null;
  assigned_user_name: string | null;
  vehicle_id?: string | null;
};

export type DashboardActionVehicle = {
  id: string;
  management_no: string | null;
  maker: string | null;
  model_name: string | null;
  status: string | null;
  market_value?: number | null;
  market_source?: string | null;
  market_checked_at?: string | null;
  purchase_date?: string | null;
  created_at?: string | null;
  is_archived?: boolean | null;
  deleted_at?: string | null;
};

export type DashboardActionListingStatus = {
  vehicle_id: string;
  channel: string;
  status: string;
};

export type DashboardActionCustomer = {
  id: string;
  name?: string | null;
};

export type TodayActionItem = {
  id: string;
  category: TodayActionCategory;
  title: string;
  detail: string;
  href: string;
  tone: AttentionTone;
  status: TodayActionStatus;
  dueAt: string | null;
  assigneeName: string | null;
  searchText: string;
};

type BuildTodayActionsParams = {
  appointments: DashboardActionAppointment[];
  deals: DashboardActionDeal[];
  maintenanceJobs: DashboardActionMaintenance[];
  vehicles: DashboardActionVehicle[];
  listingStatuses: DashboardActionListingStatus[];
  customers?: DashboardActionCustomer[];
  todayKey: string;
  memberRole?: string | null;
  memberDisplayName?: string | null;
  longStayThresholdDays?: number;
};

const CLOSED_APPOINTMENT_STATUSES = ['完了', 'キャンセル', '無断キャンセル'];
const CLOSED_DEAL_STATUSES = ['成約', '失注'];
const CLOSED_MAINTENANCE_STATUSES = ['completed', 'delivered', '完了', '納車済み'];

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiffFromToday(value: string | null | undefined, now = new Date()) {
  const target = toDate(value);
  if (!target) return null;
  return Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / 86400000);
}

function vehicleLabel(vehicle: DashboardActionVehicle | undefined) {
  if (!vehicle) return '車両';
  const label = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return label || vehicle.management_no || '車両';
}

function isInStockVehicle(vehicle: DashboardActionVehicle) {
  return !vehicle.deleted_at
    && !vehicle.is_archived
    && !['売約済み', 'sold', '納車済み', '廃車', 'scrapped'].includes(vehicle.status ?? '');
}

function sortByPriority(a: TodayActionItem, b: TodayActionItem) {
  const toneRank = { red: 0, amber: 1, blue: 2 } as const;
  const statusRank = { urgent: 0, today: 1, scheduled: 2 } as const;
  const dueA = a.dueAt ?? '9999-99-99T99:99';
  const dueB = b.dueAt ?? '9999-99-99T99:99';
  return statusRank[a.status] - statusRank[b.status]
    || toneRank[a.tone] - toneRank[b.tone]
    || dueA.localeCompare(dueB)
    || a.title.localeCompare(b.title);
}

function isAssignedToCurrentUser(assigneeName: string | null | undefined, memberDisplayName: string | null | undefined) {
  const normalizedAssignee = assigneeName?.trim();
  const normalizedMember = memberDisplayName?.trim();
  if (!normalizedAssignee || !normalizedMember) return false;
  return normalizedAssignee === normalizedMember;
}

function applyRoleScope(items: TodayActionItem[], memberRole?: string | null, memberDisplayName?: string | null) {
  if (memberRole === 'owner' || memberRole === 'admin') return items;
  return items.filter((item) => isAssignedToCurrentUser(item.assigneeName, memberDisplayName) || (!item.assigneeName && item.status === 'urgent'));
}

export function buildTodayActionItems({
  appointments,
  deals,
  maintenanceJobs,
  vehicles,
  listingStatuses,
  customers = [],
  todayKey,
  memberRole,
  memberDisplayName,
  longStayThresholdDays = 90,
}: BuildTodayActionsParams) {
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const publishedVehicleIds = new Set(
    listingStatuses.filter((item) => item.status === '掲載中').map((item) => item.vehicle_id),
  );

  const items: TodayActionItem[] = [];

  appointments
    .filter((appointment) => appointment.scheduled_at.slice(0, 10) <= todayKey && !CLOSED_APPOINTMENT_STATUSES.includes(appointment.status ?? ''))
    .forEach((appointment) => {
      const customerName = appointment.customer_id ? customerMap.get(appointment.customer_id)?.name : null;
      const vehicleName = appointment.vehicle_id ? vehicleLabel(vehicleMap.get(appointment.vehicle_id)) : null;
      const dayDiff = dayDiffFromToday(appointment.scheduled_at);
      items.push({
        id: `appointment-${appointment.id}`,
        category: 'appointment',
        title: '今日の来店・試乗予約',
        detail: [
          appointment.appointment_type ?? '予約',
          customerName || vehicleName || '-',
          formatDate(appointment.scheduled_at),
          `担当 ${appointment.assigned_user_name ?? '未割当'}`,
        ].join(' / '),
        href: '/appointments',
        tone: dayDiff !== null && dayDiff < 0 ? 'red' : 'blue',
        status: dayDiff !== null && dayDiff < 0 ? 'urgent' : 'today',
        dueAt: appointment.scheduled_at,
        assigneeName: appointment.assigned_user_name ?? null,
        searchText: [appointment.appointment_type, customerName, vehicleName, appointment.assigned_user_name].filter(Boolean).join(' '),
      });
    });

  deals
    .filter((deal) => deal.next_action_at && deal.next_action_at.slice(0, 10) <= todayKey && !CLOSED_DEAL_STATUSES.includes(deal.status ?? ''))
    .forEach((deal) => {
      const dayDiff = dayDiffFromToday(deal.next_action_at);
      const vehicleName = deal.vehicle_id ? vehicleLabel(vehicleMap.get(deal.vehicle_id)) : null;
      items.push({
        id: `deal-${deal.id}`,
        category: 'deal',
        title: '商談の次回連絡',
        detail: [
          deal.title ?? deal.deal_no ?? '商談',
          vehicleName,
          `次回対応 ${formatDate(deal.next_action_at)}`,
          `担当 ${deal.assigned_user_name ?? '未割当'}`,
        ].filter(Boolean).join(' / '),
        href: `/deals/${deal.id}`,
        tone: dayDiff !== null && dayDiff < 0 ? 'red' : 'amber',
        status: dayDiff !== null && dayDiff < 0 ? 'urgent' : 'today',
        dueAt: deal.next_action_at,
        assigneeName: deal.assigned_user_name ?? null,
        searchText: [deal.title, deal.deal_no, vehicleName, deal.assigned_user_name].filter(Boolean).join(' '),
      });
    });

  maintenanceJobs
    .filter((job) => job.scheduled_delivery_at && job.scheduled_delivery_at.slice(0, 10) <= todayKey && !CLOSED_MAINTENANCE_STATUSES.includes(job.status ?? ''))
    .forEach((job) => {
      const dayDiff = dayDiffFromToday(job.scheduled_delivery_at);
      const vehicleName = job.vehicle_id ? vehicleLabel(vehicleMap.get(job.vehicle_id)) : null;
      items.push({
        id: `maintenance-${job.id}`,
        category: 'maintenance',
        title: '車検・整備の期限',
        detail: [
          job.reception_no ?? job.job_no ?? '整備案件',
          job.job_type,
          vehicleName,
          `納車予定 ${formatDate(job.scheduled_delivery_at)}`,
          `担当 ${job.assigned_user_name ?? '未割当'}`,
        ].filter(Boolean).join(' / '),
        href: `/maintenance/${job.id}`,
        tone: dayDiff !== null && dayDiff < 0 ? 'red' : 'blue',
        status: dayDiff !== null && dayDiff < 0 ? 'urgent' : 'today',
        dueAt: job.scheduled_delivery_at,
        assigneeName: job.assigned_user_name ?? null,
        searchText: [job.reception_no, job.job_no, job.job_type, vehicleName, job.assigned_user_name].filter(Boolean).join(' '),
      });
    });

  vehicles
    .filter((vehicle) => isInStockVehicle(vehicle) && (vehicle.market_value == null || !vehicle.market_source || !vehicle.market_checked_at))
    .forEach((vehicle) => {
      items.push({
        id: `market-${vehicle.id}`,
        category: 'listing',
        title: '相場確認が未完了',
        detail: `${vehicleLabel(vehicle)} / 相場金額・確認元・確認日を入力`,
        href: `/vehicles/${vehicle.id}`,
        tone: 'amber',
        status: 'scheduled',
        dueAt: vehicle.market_checked_at ?? vehicle.created_at ?? null,
        assigneeName: null,
        searchText: `${vehicleLabel(vehicle)} 相場確認`,
      });
    });

  listingStatuses
    .filter((item) => item.status === 'エラー')
    .forEach((item) => {
      const vehicle = vehicleMap.get(item.vehicle_id);
      if (!vehicle) return;
      items.push({
        id: `listing-error-${item.vehicle_id}-${item.channel}`,
        category: 'listing',
        title: '掲載エラー',
        detail: `${vehicleLabel(vehicle)} / ${item.channel}`,
        href: `/vehicles/${vehicle.id}`,
        tone: 'red',
        status: 'urgent',
        dueAt: null,
        assigneeName: null,
        searchText: `${vehicleLabel(vehicle)} ${item.channel} 掲載エラー`,
      });
    });

  vehicles
    .filter((vehicle) => ['売約済み', '納車済み'].includes(vehicle.status ?? '') && publishedVehicleIds.has(vehicle.id))
    .forEach((vehicle) => {
      items.push({
        id: `sold-listed-${vehicle.id}`,
        category: 'listing',
        title: '売約後も掲載中',
        detail: `${vehicleLabel(vehicle)} / 公開停止の確認が必要`,
        href: `/vehicles/${vehicle.id}`,
        tone: 'red',
        status: 'urgent',
        dueAt: null,
        assigneeName: null,
        searchText: `${vehicleLabel(vehicle)} 売約後掲載`,
      });
    });

  vehicles
    .filter((vehicle) => {
      if (!isInStockVehicle(vehicle)) return false;
      const baseDate = toDate(vehicle.purchase_date ?? vehicle.created_at);
      if (!baseDate) return false;
      const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(baseDate).getTime()) / 86400000);
      return diff > longStayThresholdDays;
    })
    .forEach((vehicle) => {
      items.push({
        id: `long-stay-${vehicle.id}`,
        category: 'inventory',
        title: '長期在庫の見直し',
        detail: `${vehicleLabel(vehicle)} / ${longStayThresholdDays}日超え`,
        href: `/vehicles/${vehicle.id}`,
        tone: 'amber',
        status: 'scheduled',
        dueAt: vehicle.purchase_date ?? vehicle.created_at ?? null,
        assigneeName: null,
        searchText: `${vehicleLabel(vehicle)} 長期在庫`,
      });
    });

  return applyRoleScope(items, memberRole, memberDisplayName).sort(sortByPriority);
}

export function getTodayActionCategoryLabel(category: TodayActionCategory) {
  switch (category) {
    case 'appointment':
      return '来店・試乗予約';
    case 'deal':
      return '商談';
    case 'maintenance':
      return '整備・車検';
    case 'listing':
      return '掲載・相場';
    case 'inventory':
      return '在庫';
    default:
      return category;
  }
}

export function getTodayActionStatusLabel(status: TodayActionStatus) {
  switch (status) {
    case 'urgent':
      return '緊急';
    case 'today':
      return '今日';
    case 'scheduled':
      return '予定';
    default:
      return status;
  }
}

export function getTodayActionToneClass(tone: AttentionTone) {
  if (tone === 'red') return 'border-red-200 bg-red-50/70';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50/70';
  return 'border-blue-200 bg-blue-50/60';
}
