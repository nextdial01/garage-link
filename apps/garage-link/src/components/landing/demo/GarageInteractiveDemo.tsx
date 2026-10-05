'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CarFront,
  ChevronRight,
  ClipboardList,
  Plus,
  Search,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { InventoryAgeDonut, VehicleStatusBars, type ChartDatum } from '@/components/dashboard/DashboardCharts';
import { trackConversion, trackConversionOnce } from '@/lib/analytics/conversion';
import { TrackedSignupLink } from '../TrackedSignupLink';
import {
  DEMO_BUSINESS_OPTIONS,
  DEMO_GOAL_OPTIONS,
  DEMO_MANAGEMENT_OPTIONS,
  defaultViewForGoal,
  generateGarageDemoData,
  scenarioFromQuery,
  type DemoBusiness,
  type DemoGoal,
  type DemoManagement,
  type DemoScenario,
  type DemoView,
  type DemoVehicle,
} from './garageDemoData';

const viewItems: Array<{ view: DemoView; label: string; icon: typeof CarFront }> = [
  { view: 'today', label: '今日', icon: CalendarDays },
  { view: 'vehicles', label: '車両', icon: CarFront },
  { view: 'customers', label: '顧客', icon: UsersRound },
  { view: 'deals', label: '商談', icon: ClipboardList },
  { view: 'maintenance', label: '整備', icon: Wrench },
];

const statusTone: Record<string, string> = {
  展示中: 'bg-slate-100 text-slate-700',
  商談中: 'bg-amber-50 text-amber-800',
  整備中: 'bg-blue-50 text-blue-700',
  売約済み: 'bg-emerald-50 text-emerald-700',
  新規: 'bg-slate-100 text-slate-700',
  連絡済み: 'bg-blue-50 text-blue-700',
  来店予定: 'bg-amber-50 text-amber-800',
  見積済み: 'bg-violet-50 text-violet-700',
  成約: 'bg-emerald-50 text-emerald-700',
  受付: 'bg-slate-100 text-slate-700',
  作業中: 'bg-blue-50 text-blue-700',
  部品待ち: 'bg-amber-50 text-amber-800',
  納車準備: 'bg-emerald-50 text-emerald-700',
};

function scenarioKey(scenario: DemoScenario) {
  return `${scenario.business}:${scenario.management}:${scenario.goal}`;
}

function formatYen(value: number) {
  if (!value) return '—';
  return `${value.toLocaleString('ja-JP')}円`;
}

function vehicleName(vehicle: DemoVehicle | undefined) {
  if (!vehicle) return '車両';
  return `${vehicle.maker} ${vehicle.model}`;
}

function viewTitle(view: DemoView) {
  switch (view) {
    case 'today': return '今日';
    case 'vehicles': return '車両';
    case 'customers': return '顧客';
    case 'deals': return '商談';
    case 'maintenance': return '整備';
    case 'quote': return '見積';
  }
}

export function GarageInteractiveDemo({
  standalone = false,
  initialScenario: initialScenarioProp,
  forcedView,
  hideConfigurator = false,
  storyMode = false,
}: {
  standalone?: boolean;
  initialScenario?: DemoScenario;
  forcedView?: DemoView;
  hideConfigurator?: boolean;
  storyMode?: boolean;
}) {
  const searchParams = useSearchParams();
  const initialScenario = useMemo(
    () => initialScenarioProp ?? scenarioFromQuery(new URLSearchParams(searchParams.toString())),
    [initialScenarioProp, searchParams],
  );
  const [scenario, setScenario] = useState<DemoScenario>(initialScenario);
  const [draftScenario, setDraftScenario] = useState<DemoScenario>(initialScenario);
  const [variant, setVariant] = useState(0);
  const [data, setData] = useState(() => generateGarageDemoData(initialScenario));
  const [view, setView] = useState<DemoView>(() => defaultViewForGoal(initialScenario.goal));
  const currentView = forcedView ?? view;
  const [selectedVehicleId, setSelectedVehicleId] = useState(data.vehicles[0]?.id ?? '');
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [draftMaker, setDraftMaker] = useState('');
  const [draftModel, setDraftModel] = useState('');

  const selectedVehicle = useMemo(
    () => data.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? data.vehicles[0],
    [data.vehicles, selectedVehicleId],
  );

  useEffect(() => {
    trackConversionOnce('demo_view', {
      demo_scenario: scenarioKey(initialScenario),
      demo_view: defaultViewForGoal(initialScenario.goal),
    });
  }, [initialScenario]);

  const inventoryAgeData = useMemo<ChartDatum[]>(() => {
    const ranges = [
      { label: '30日以内', min: 0, max: 30, color: '#2563eb' },
      { label: '31〜60日', min: 31, max: 60, color: '#22c55e' },
      { label: '61〜90日', min: 61, max: 90, color: '#f59e0b' },
      { label: '90日超', min: 91, max: Number.POSITIVE_INFINITY, color: '#ef4444' },
    ];
    return ranges.map((range) => ({
      label: range.label,
      value: data.vehicles.filter((vehicle) => vehicle.stockDays >= range.min && vehicle.stockDays <= range.max).length,
      color: range.color,
    }));
  }, [data.vehicles]);

  const vehicleStatusData = useMemo<ChartDatum[]>(() => {
    const statuses = ['展示中', '商談中', '整備中', '売約済み'] as const;
    const colors = ['#2563eb', '#f59e0b', '#0ea5e9', '#22c55e'];
    return statuses.map((status, index) => ({
      label: status,
      value: data.vehicles.filter((vehicle) => vehicle.status === status).length,
      color: colors[index],
    }));
  }, [data.vehicles]);

  function selectView(nextView: DemoView, action = 'view_switch') {
    setView(nextView);
    trackConversion('demo_interaction', {
      demo_action: action,
      demo_scenario: scenarioKey(scenario),
      demo_view: nextView,
    });
    if (nextView === 'quote') {
      trackConversion('demo_quote_opened', {
        demo_scenario: scenarioKey(scenario),
        demo_view: nextView,
      });
    }
  }

  function generateScenario() {
    const nextVariant = variant + 1;
    const nextData = generateGarageDemoData(draftScenario, nextVariant);
    setVariant(nextVariant);
    setScenario(draftScenario);
    setData(nextData);
    setSelectedVehicleId(nextData.vehicles[0]?.id ?? '');
    setView(defaultViewForGoal(draftScenario.goal));
    setShowVehicleForm(false);
    setDraftMaker('');
    setDraftModel('');
    trackConversion('demo_scenario_generated', {
      demo_action: 'regenerate',
      demo_scenario: scenarioKey(draftScenario),
      demo_view: defaultViewForGoal(draftScenario.goal),
    });
  }

  function addVehicle() {
    const maker = draftMaker.trim() || (scenario.business === 'motorcycle' ? 'ヤマハ' : 'トヨタ');
    const model = draftModel.trim() || (scenario.business === 'motorcycle' ? 'XSR700' : 'シエンタ');
    const id = `v-demo-${data.vehicles.length + 1}`;
    const nextVehicle: DemoVehicle = {
      id,
      managementNo: `DEMO-${String(data.vehicles.length + 1).padStart(3, '0')}`,
      maker,
      model,
      status: scenario.business === 'maintenance' ? '整備中' : '展示中',
      totalPrice: scenario.business === 'maintenance' ? 0 : 1880000,
      purchasePrice: scenario.business === 'maintenance' ? 0 : 1420000,
      stockDays: 1,
      mileageKm: 24000,
      inspectionExpiry: '2028-04-20',
      location: scenario.business === 'maintenance' ? '第1ピット' : '本店',
    };
    setData((current) => ({ ...current, vehicles: [nextVehicle, ...current.vehicles] }));
    setSelectedVehicleId(id);
    setShowVehicleForm(false);
    setDraftMaker('');
    setDraftModel('');
    trackConversion('demo_vehicle_created', {
      demo_action: 'create_vehicle',
      demo_scenario: scenarioKey(scenario),
      demo_view: 'vehicles',
    });
  }

  function createDealFromVehicle() {
    if (!selectedVehicle) return;
    const nextId = `d-demo-${data.deals.length + 1}`;
    const customer = data.customers[0];
    setData((current) => ({
      ...current,
      deals: [{
        id: nextId,
        customerId: customer?.id ?? 'c1',
        vehicleId: selectedVehicle.id,
        title: `${vehicleName(selectedVehicle)} 新規商談`,
        status: '新規',
        nextAction: '今日 16:30',
        budget: Math.max(selectedVehicle.totalPrice, 150000),
      }, ...current.deals],
    }));
    setView('deals');
    trackConversion('demo_deal_created', {
      demo_action: 'create_deal',
      demo_scenario: scenarioKey(scenario),
      demo_view: 'deals',
    });
  }

  function renderToday() {
    const attentionCount = data.vehicles.filter((vehicle) => vehicle.stockDays > 90).length;
    const nextDeal = data.deals.find((deal) => deal.status !== '成約');
    const nextMaintenance = data.maintenance[0];

    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">今日の予定</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{data.deals.length + data.maintenance.length}</p>
            <p className="mt-1 text-xs text-slate-500">商談と整備をまとめて確認</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">要確認の在庫</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{attentionCount}</p>
            <p className="mt-1 text-xs text-slate-500">90日超の在庫</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">顧客</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{data.customers.length}</p>
            <p className="mt-1 text-xs text-slate-500">次回連絡も同じ台帳</p>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <InventoryAgeDonut data={inventoryAgeData} thresholdDays={90} />
          <VehicleStatusBars data={vehicleStatusData} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">次に動くこと</p>
              <p className="mt-0.5 text-xs text-slate-500">今日の優先順に並べます</p>
            </div>
            <button type="button" onClick={() => selectView('deals')} className="text-xs font-semibold text-blue-700">商談を開く</button>
          </div>
          <div className="divide-y divide-slate-100">
            {nextDeal && (
              <button type="button" onClick={() => selectView('deals')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700"><ClipboardList className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-semibold text-slate-950">{nextDeal.title}</strong>
                  <small className="text-xs text-slate-500">次回 {nextDeal.nextAction}</small>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            )}
            {nextMaintenance && (
              <button type="button" onClick={() => selectView('maintenance')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700"><Wrench className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-semibold text-slate-950">{nextMaintenance.jobType}</strong>
                  <small className="text-xs text-slate-500">納車予定 {nextMaintenance.delivery}</small>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderVehicles() {
    return (
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">車両一覧</p>
              <p className="mt-0.5 text-xs text-slate-500">全{data.vehicles.length}台</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative hidden sm:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input readOnly value="" placeholder="メーカー・車種で検索" className="h-9 w-48 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none" />
              </label>
              <button type="button" onClick={() => setShowVehicleForm((current) => !current)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white">
                <Plus className="h-3.5 w-3.5" /> 車両を追加
              </button>
            </div>
          </div>

          {showVehicleForm && (
            <div className="grid gap-3 border-b border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-[1fr_1fr_auto]">
              <input aria-label="デモ車両メーカー" value={draftMaker} onChange={(event) => setDraftMaker(event.target.value)} placeholder="メーカー" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500" />
              <input aria-label="デモ車両車名" value={draftModel} onChange={(event) => setDraftModel(event.target.value)} placeholder="車名" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500" />
              <button type="button" onClick={addVehicle} className="h-10 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white">このデモに追加</button>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {data.vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                onClick={() => {
                  setSelectedVehicleId(vehicle.id);
                  trackConversion('demo_interaction', {
                    demo_action: 'vehicle_opened',
                    demo_scenario: scenarioKey(scenario),
                    demo_view: 'vehicles',
                  });
                }}
                className={`grid w-full gap-2 px-4 py-3 text-left transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1.5fr)_110px_100px_100px] sm:items-center ${selectedVehicle?.id === vehicle.id ? 'bg-blue-50/50' : ''}`}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-semibold text-slate-950">{vehicleName(vehicle)}</strong>
                  <small className="text-xs text-slate-500">{vehicle.managementNo} / {vehicle.location}</small>
                </span>
                <span><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone[vehicle.status] ?? 'bg-slate-100 text-slate-700'}`}>{vehicle.status}</span></span>
                <span className="text-xs font-medium text-slate-700">{vehicle.stockDays ? `${vehicle.stockDays}日` : '—'}</span>
                <span className="text-xs font-semibold text-slate-950">{vehicle.totalPrice ? formatYen(vehicle.totalPrice) : '整備車両'}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="self-start rounded-2xl border border-slate-200 bg-white p-4 xl:sticky xl:top-4">
          {selectedVehicle ? (
            <>
              <div className="border-b border-slate-100 pb-4">
                <p className="text-xs font-medium text-slate-500">選択中の車両</p>
                <h4 className="mt-1 text-base font-semibold text-slate-950">{vehicleName(selectedVehicle)}</h4>
                <p className="mt-1 text-xs text-slate-500">{selectedVehicle.managementNo}</p>
              </div>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">状態</dt><dd className="font-semibold text-slate-950">{selectedVehicle.status}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">在庫日数</dt><dd className="font-semibold text-slate-950">{selectedVehicle.stockDays || '—'}{selectedVehicle.stockDays ? '日' : ''}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">走行距離</dt><dd className="font-semibold text-slate-950">{selectedVehicle.mileageKm.toLocaleString('ja-JP')}km</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">車検満了</dt><dd className="font-semibold text-slate-950">{selectedVehicle.inspectionExpiry}</dd></div>
              </dl>
              <div className="mt-5 grid gap-2">
                <button type="button" onClick={createDealFromVehicle} className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white">この車両で商談を作る</button>
                <button type="button" onClick={() => selectView('quote', 'quote_from_vehicle')} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">見積を開く</button>
              </div>
            </>
          ) : <p className="text-sm text-slate-500">車両を選択してください。</p>}
        </aside>
      </div>
    );
  }

  function renderCustomers() {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">顧客</p>
            <p className="mt-0.5 text-xs text-slate-500">車両と次回連絡を同じ一覧で</p>
          </div>
          <button type="button" onClick={() => trackConversion('demo_interaction', { demo_action: 'customer_list_action', demo_scenario: scenarioKey(scenario), demo_view: 'customers' })} className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white">顧客を追加</button>
        </div>
        <div className="hidden grid-cols-[1.3fr_1.2fr_110px_110px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-medium text-slate-500 sm:grid">
          <span>顧客</span><span>車両</span><span>状態</span><span>次回</span>
        </div>
        <div className="divide-y divide-slate-100">
          {data.customers.map((customer) => {
            const vehicle = data.vehicles.find((item) => item.id === customer.vehicleId);
            return (
              <button key={customer.id} type="button" className="grid w-full gap-2 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[1.3fr_1.2fr_110px_110px] sm:items-center" onClick={() => trackConversion('demo_interaction', { demo_action: 'customer_opened', demo_scenario: scenarioKey(scenario), demo_view: 'customers' })}>
                <span><strong className="block text-sm font-semibold text-slate-950">{customer.name}</strong><small className="text-xs text-slate-500">{customer.phone}</small></span>
                <span className="text-xs text-slate-700">{vehicleName(vehicle)}</span>
                <span><span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{customer.status}</span></span>
                <span className="text-xs font-semibold text-slate-950">{customer.nextAction}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderDeals() {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">商談</p>
            <p className="mt-0.5 text-xs text-slate-500">次回連絡が近い順</p>
          </div>
          <button type="button" onClick={() => selectView('vehicles', 'deal_start_from_vehicle')} className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white">車両から商談を作る</button>
        </div>
        <div className="divide-y divide-slate-100">
          {data.deals.map((deal) => {
            const customer = data.customers.find((item) => item.id === deal.customerId);
            const vehicle = data.vehicles.find((item) => item.id === deal.vehicleId);
            return (
              <button key={deal.id} type="button" onClick={() => selectView('quote', 'quote_from_deal')} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[minmax(0,1.5fr)_1fr_110px_110px] sm:items-center">
                <span><strong className="block truncate text-sm font-semibold text-slate-950">{deal.title}</strong><small className="text-xs text-slate-500">{customer?.name ?? '顧客'} / {vehicleName(vehicle)}</small></span>
                <span className="text-xs text-slate-700">{formatYen(deal.budget)}</span>
                <span><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone[deal.status] ?? 'bg-slate-100 text-slate-700'}`}>{deal.status}</span></span>
                <span className="text-xs font-semibold text-slate-950">{deal.nextAction}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderMaintenance() {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">整備</p>
            <p className="mt-0.5 text-xs text-slate-500">受付から納車予定まで</p>
          </div>
          <button type="button" onClick={() => trackConversion('demo_interaction', { demo_action: 'maintenance_action', demo_scenario: scenarioKey(scenario), demo_view: 'maintenance' })} className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white">整備を追加</button>
        </div>
        <div className="divide-y divide-slate-100">
          {data.maintenance.map((job) => {
            const customer = data.customers.find((item) => item.id === job.customerId);
            const vehicle = data.vehicles.find((item) => item.id === job.vehicleId);
            return (
              <button key={job.id} type="button" onClick={() => selectView('quote', 'quote_from_maintenance')} className="grid w-full gap-2 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[minmax(0,1.5fr)_1fr_110px_120px] sm:items-center">
                <span><strong className="block text-sm font-semibold text-slate-950">{job.jobType}</strong><small className="text-xs text-slate-500">{customer?.name ?? '顧客'} / {vehicleName(vehicle)}</small></span>
                <span className="text-xs text-slate-700">{formatYen(job.estimate)}</span>
                <span><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone[job.status] ?? 'bg-slate-100 text-slate-700'}`}>{job.status}</span></span>
                <span className="text-xs font-semibold text-slate-950">{job.delivery}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderQuote() {
    const total = data.quoteLines.reduce((sum, line) => sum + line.amount, 0);
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-4">
            <p className="text-sm font-semibold text-slate-950">見積書</p>
            <p className="mt-0.5 text-xs text-slate-500">{selectedVehicle ? vehicleName(selectedVehicle) : data.businessLabel} / デモ見積</p>
          </div>
          <div className="divide-y divide-slate-100">
            {data.quoteLines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-4 px-4 py-4">
                <span className="text-sm text-slate-700">{line.label}</span>
                <strong className="text-sm font-semibold text-slate-950">{formatYen(line.amount)}</strong>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 bg-slate-50 px-4 py-5">
            <span className="text-sm font-semibold text-slate-700">合計</span>
            <strong className="text-2xl font-semibold tracking-tight text-slate-950">{formatYen(total)}</strong>
          </div>
        </section>
        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">デモでここまで作れました</p>
          <h4 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">同じ流れを自分の店舗で続ける</h4>
          <p className="mt-2 text-xs leading-6 text-slate-500">登録後は実データへ切り替わります。デモデータは保存されません。</p>
          <TrackedSignupLink placement="interactive_demo_quote" source="interactive_demo" className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white">
            この状態から無料で始める
          </TrackedSignupLink>
          <button type="button" onClick={() => selectView('vehicles', 'back_to_vehicles')} className="mt-2 h-10 w-full rounded-lg border border-slate-200 text-xs font-semibold text-slate-700">車両へ戻る</button>
        </aside>
      </div>
    );
  }

  return (
    <section
      data-testid={storyMode ? 'garage-scroll-story-demo' : 'garage-live-demo'}
      data-story-mode={storyMode ? 'true' : undefined}
      className={`${standalone ? 'mx-auto w-full max-w-[1500px]' : 'w-full'} ${storyMode ? 'pointer-events-none select-none' : ''}`}
    >
      {!hideConfigurator && <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">業態</span>
          <select aria-label="デモ業態" value={draftScenario.business} onChange={(event) => setDraftScenario((current) => ({ ...current, business: event.target.value as DemoBusiness }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500">
            {DEMO_BUSINESS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">今の管理</span>
          <select aria-label="デモ管理方法" value={draftScenario.management} onChange={(event) => setDraftScenario((current) => ({ ...current, management: event.target.value as DemoManagement }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500">
            {DEMO_MANAGEMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">最初に見たいこと</span>
          <select aria-label="デモ目的" value={draftScenario.goal} onChange={(event) => setDraftScenario((current) => ({ ...current, goal: event.target.value as DemoGoal }))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500">
            {DEMO_GOAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={generateScenario} className="min-h-10 self-end rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">この条件でデモを作る</button>
      </div>}

      <div className={storyMode ? "overflow-hidden rounded-[18px] border border-slate-200 bg-[#f7f8fa] shadow-[0_30px_90px_rgba(15,23,42,.12)]" : "overflow-hidden rounded-[22px] border border-slate-200 bg-[#f7f8fa] shadow-[0_22px_70px_rgba(15,23,42,.10)]"}>
        <div className="flex min-h-[620px]">
          <aside className={`${storyMode ? 'w-[164px]' : 'w-[176px]'} hidden shrink-0 border-r border-slate-200 bg-white p-3 md:block`}>
            <div className="mb-4 rounded-xl border border-slate-200 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Demo workspace</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-950">{data.storeName}</p>
            </div>
            <nav className="space-y-1" aria-label="デモ画面">
              {viewItems.map((item) => {
                const Icon = item.icon;
                const active = currentView === item.view;
                return (
                  <button key={item.view} type="button" onClick={() => selectView(item.view)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-[10px] font-medium text-slate-400">生成条件</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">{data.businessLabel}<br />{data.sourceLabel}<br />{data.focusLabel}</p>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[.14em] text-slate-400">GARAGE LINK / LIVE DEMO</p>
                  <h3 className="mt-0.5 truncate text-base font-semibold tracking-tight text-slate-950">{viewTitle(currentView)}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:inline-flex">保存されないデモデータ</span>
                  {!storyMode && (
                    <TrackedSignupLink placement="interactive_demo_header" source="interactive_demo" className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white">
                      無料で使う
                    </TrackedSignupLink>
                  )}
                </div>
              </div>
              {!storyMode && <nav className="mt-3 flex gap-1 overflow-x-auto md:hidden" aria-label="デモ画面モバイル">
                {viewItems.map((item) => {
                  const active = currentView === item.view;
                  return (
                    <button key={item.view} type="button" onClick={() => selectView(item.view)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${active ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {item.label}
                    </button>
                  );
                })}
              </nav>}
            </header>

            <div key={currentView} className={`${storyMode ? 'garage-demo-view-transition ' : ''}p-3 sm:p-5`}>
              {currentView === 'today' && renderToday()}
              {currentView === 'vehicles' && renderVehicles()}
              {currentView === 'customers' && renderCustomers()}
              {currentView === 'deals' && renderDeals()}
              {currentView === 'maintenance' && renderMaintenance()}
              {currentView === 'quote' && renderQuote()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
