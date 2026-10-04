export type DemoBusiness = 'used-car' | 'maintenance' | 'motorcycle';
export type DemoManagement = 'excel' | 'paper' | 'mixed';
export type DemoGoal = 'inventory' | 'customers' | 'sales' | 'maintenance';
export type DemoView = 'today' | 'vehicles' | 'customers' | 'deals' | 'maintenance' | 'quote';

export type DemoScenario = {
  business: DemoBusiness;
  management: DemoManagement;
  goal: DemoGoal;
};

export type DemoVehicle = {
  id: string;
  managementNo: string;
  maker: string;
  model: string;
  status: '展示中' | '商談中' | '整備中' | '売約済み';
  totalPrice: number;
  purchasePrice: number;
  stockDays: number;
  mileageKm: number;
  inspectionExpiry: string;
  location: string;
};

export type DemoCustomer = {
  id: string;
  name: string;
  vehicleId: string | null;
  phone: string;
  nextAction: string;
  status: '要連絡' | '商談中' | '既存顧客';
};

export type DemoDeal = {
  id: string;
  customerId: string;
  vehicleId: string | null;
  title: string;
  status: '新規' | '連絡済み' | '来店予定' | '商談中' | '見積済み' | '成約';
  nextAction: string;
  budget: number;
};

export type DemoMaintenance = {
  id: string;
  customerId: string;
  vehicleId: string;
  jobType: string;
  status: '受付' | '作業中' | '部品待ち' | '納車準備';
  delivery: string;
  estimate: number;
};

export type DemoQuoteLine = {
  id: string;
  label: string;
  amount: number;
};

export type DemoWorkspaceData = {
  storeName: string;
  businessLabel: string;
  sourceLabel: string;
  focusLabel: string;
  vehicles: DemoVehicle[];
  customers: DemoCustomer[];
  deals: DemoDeal[];
  maintenance: DemoMaintenance[];
  quoteLines: DemoQuoteLine[];
};

export const DEMO_BUSINESS_OPTIONS: Array<{ value: DemoBusiness; label: string }> = [
  { value: 'used-car', label: '中古車販売' },
  { value: 'maintenance', label: '整備・車検' },
  { value: 'motorcycle', label: 'バイク販売・修理' },
];

export const DEMO_MANAGEMENT_OPTIONS: Array<{ value: DemoManagement; label: string }> = [
  { value: 'excel', label: 'Excel中心' },
  { value: 'paper', label: '紙・ホワイトボード' },
  { value: 'mixed', label: '複数ツールに分散' },
];

export const DEMO_GOAL_OPTIONS: Array<{ value: DemoGoal; label: string }> = [
  { value: 'inventory', label: '在庫を見たい' },
  { value: 'customers', label: '顧客を見たい' },
  { value: 'sales', label: '商談・見積を見たい' },
  { value: 'maintenance', label: '整備を見たい' },
];

const usedCarVehicles: DemoVehicle[] = [
  { id: 'v1', managementNo: 'A-101', maker: 'トヨタ', model: 'プリウス', status: '展示中', totalPrice: 2180000, purchasePrice: 1640000, stockDays: 18, mileageKm: 42100, inspectionExpiry: '2027-08-20', location: '本店' },
  { id: 'v2', managementNo: 'A-102', maker: 'ホンダ', model: 'N-BOX', status: '商談中', totalPrice: 1490000, purchasePrice: 1110000, stockDays: 7, mileageKm: 18600, inspectionExpiry: '2028-01-13', location: '本店' },
  { id: 'v3', managementNo: 'A-103', maker: 'スズキ', model: 'ジムニー', status: '整備中', totalPrice: 1980000, purchasePrice: 1510000, stockDays: 42, mileageKm: 33700, inspectionExpiry: '2027-12-03', location: '第二展示場' },
  { id: 'v4', managementNo: 'A-104', maker: '日産', model: 'セレナ', status: '展示中', totalPrice: 2390000, purchasePrice: 1830000, stockDays: 96, mileageKm: 58900, inspectionExpiry: '2027-05-18', location: '本店' },
  { id: 'v5', managementNo: 'A-105', maker: 'マツダ', model: 'CX-5', status: '売約済み', totalPrice: 2570000, purchasePrice: 2010000, stockDays: 31, mileageKm: 26800, inspectionExpiry: '2028-03-09', location: '納車準備' },
];

const motorcycleVehicles: DemoVehicle[] = [
  { id: 'v1', managementNo: 'B-201', maker: 'ホンダ', model: 'Rebel 250', status: '展示中', totalPrice: 648000, purchasePrice: 492000, stockDays: 14, mileageKm: 4100, inspectionExpiry: '2028-04-14', location: 'ショールーム' },
  { id: 'v2', managementNo: 'B-202', maker: 'ヤマハ', model: 'MT-07', status: '商談中', totalPrice: 828000, purchasePrice: 646000, stockDays: 9, mileageKm: 8200, inspectionExpiry: '2027-11-02', location: 'ショールーム' },
  { id: 'v3', managementNo: 'B-203', maker: 'カワサキ', model: 'Z900RS', status: '整備中', totalPrice: 1480000, purchasePrice: 1190000, stockDays: 33, mileageKm: 12900, inspectionExpiry: '2028-06-21', location: '整備ピット' },
  { id: 'v4', managementNo: 'B-204', maker: 'スズキ', model: 'V-Strom 250', status: '展示中', totalPrice: 598000, purchasePrice: 451000, stockDays: 61, mileageKm: 6900, inspectionExpiry: '2028-02-12', location: 'ショールーム' },
];

const maintenanceVehicles: DemoVehicle[] = [
  { id: 'v1', managementNo: 'M-301', maker: 'トヨタ', model: 'ハイエース', status: '整備中', totalPrice: 0, purchasePrice: 0, stockDays: 0, mileageKm: 128400, inspectionExpiry: '2026-11-18', location: '第1ピット' },
  { id: 'v2', managementNo: 'M-302', maker: 'ダイハツ', model: 'タント', status: '整備中', totalPrice: 0, purchasePrice: 0, stockDays: 0, mileageKm: 76400, inspectionExpiry: '2026-10-24', location: '第2ピット' },
  { id: 'v3', managementNo: 'M-303', maker: 'ホンダ', model: 'フィット', status: '展示中', totalPrice: 0, purchasePrice: 0, stockDays: 0, mileageKm: 49200, inspectionExpiry: '2027-02-07', location: '納車待ち' },
  { id: 'v4', managementNo: 'M-304', maker: '日産', model: 'ノート', status: '整備中', totalPrice: 0, purchasePrice: 0, stockDays: 0, mileageKm: 55800, inspectionExpiry: '2026-12-19', location: '第1ピット' },
];

function labelFor<T extends string>(options: Array<{ value: T; label: string }>, value: T) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function scenarioVehicles(business: DemoBusiness) {
  if (business === 'maintenance') return maintenanceVehicles.map((item) => ({ ...item }));
  if (business === 'motorcycle') return motorcycleVehicles.map((item) => ({ ...item }));
  return usedCarVehicles.map((item) => ({ ...item }));
}

function customerNames(business: DemoBusiness) {
  if (business === 'maintenance') return ['株式会社山本設備', '佐藤 真紀', '中村運送株式会社', '森田 健'];
  if (business === 'motorcycle') return ['岡田 翔', '山口 遼', '小林 拓海', '藤田 直樹'];
  return ['田中 健一', '株式会社オオサカ企画', '山田 美咲', '株式会社西日本物流'];
}

export function generateGarageDemoData(scenario: DemoScenario, variant = 0): DemoWorkspaceData {
  const vehicles = scenarioVehicles(scenario.business);
  const names = customerNames(scenario.business);
  const suffix = variant > 0 ? ` ${variant + 1}` : '';

  const customers: DemoCustomer[] = names.map((name, index) => ({
    id: `c${index + 1}`,
    name: `${name}${index === 0 ? suffix : ''}`,
    vehicleId: vehicles[index % vehicles.length]?.id ?? null,
    phone: `090-1234-${String(5600 + index).padStart(4, '0')}`,
    nextAction: index === 0 ? '今日 15:00' : index === 1 ? '明日 10:00' : index === 2 ? '10/08' : '10/11',
    status: index === 0 ? '要連絡' : index === 1 ? '商談中' : '既存顧客',
  }));

  const deals: DemoDeal[] = [
    { id: 'd1', customerId: 'c1', vehicleId: vehicles[0]?.id ?? null, title: scenario.business === 'maintenance' ? '車検＋ブレーキ点検' : `${vehicles[0]?.maker ?? ''} ${vehicles[0]?.model ?? ''} 商談`, status: '来店予定', nextAction: '今日 15:00', budget: scenario.business === 'maintenance' ? 160000 : 2300000 },
    { id: 'd2', customerId: 'c2', vehicleId: vehicles[1]?.id ?? null, title: scenario.business === 'maintenance' ? '法定点検' : `${vehicles[1]?.maker ?? ''} ${vehicles[1]?.model ?? ''} 見積`, status: '見積済み', nextAction: '明日 10:00', budget: scenario.business === 'maintenance' ? 68000 : 1650000 },
    { id: 'd3', customerId: 'c3', vehicleId: vehicles[2]?.id ?? null, title: scenario.business === 'maintenance' ? '異音診断' : `${vehicles[2]?.maker ?? ''} ${vehicles[2]?.model ?? ''} 下取相談`, status: '商談中', nextAction: '10/08', budget: scenario.business === 'maintenance' ? 120000 : 2050000 },
  ];

  const maintenance: DemoMaintenance[] = [
    { id: 'm1', customerId: 'c1', vehicleId: vehicles[0]?.id ?? 'v1', jobType: scenario.business === 'maintenance' ? '車検整備' : '納車前整備', status: '作業中', delivery: '今日 17:00', estimate: 128000 },
    { id: 'm2', customerId: 'c2', vehicleId: vehicles[1]?.id ?? 'v2', jobType: '12か月点検', status: '受付', delivery: '明日 16:00', estimate: 46200 },
    { id: 'm3', customerId: 'c3', vehicleId: vehicles[2]?.id ?? 'v3', jobType: 'タイヤ・ブレーキ確認', status: '部品待ち', delivery: '10/08 13:00', estimate: 82400 },
  ];

  const quoteBase = scenario.business === 'maintenance' ? 68000 : Math.max(480000, Math.round((vehicles[0]?.totalPrice ?? 2180000) * 0.94));
  const quoteLines: DemoQuoteLine[] = scenario.business === 'maintenance'
    ? [
        { id: 'q1', label: '点検・整備工賃', amount: 42000 },
        { id: 'q2', label: '部品・消耗品', amount: 18000 },
        { id: 'q3', label: '諸費用', amount: 8000 },
      ]
    : [
        { id: 'q1', label: '車両本体価格', amount: quoteBase },
        { id: 'q2', label: '登録代行費用', amount: 44000 },
        { id: 'q3', label: '納車整備費用', amount: 55000 },
      ];

  const storeName = scenario.business === 'maintenance'
    ? 'かんなぎ整備サービス'
    : scenario.business === 'motorcycle'
      ? 'GARAGE LINK Riders'
      : 'GARAGE LINK Motors';

  return {
    storeName,
    businessLabel: labelFor(DEMO_BUSINESS_OPTIONS, scenario.business),
    sourceLabel: labelFor(DEMO_MANAGEMENT_OPTIONS, scenario.management),
    focusLabel: labelFor(DEMO_GOAL_OPTIONS, scenario.goal),
    vehicles,
    customers,
    deals,
    maintenance,
    quoteLines,
  };
}

export function scenarioFromQuery(searchParams: URLSearchParams): DemoScenario {
  const scenario = searchParams.get('scenario');
  const goal = searchParams.get('goal');

  const business: DemoBusiness =
    scenario === 'maintenance' ? 'maintenance' :
    scenario === 'motorcycle' ? 'motorcycle' :
    'used-car';

  const management: DemoManagement =
    searchParams.get('management') === 'paper' ? 'paper' :
    searchParams.get('management') === 'mixed' ? 'mixed' :
    'excel';

  const resolvedGoal: DemoGoal =
    goal === 'customers' ? 'customers' :
    goal === 'sales' ? 'sales' :
    goal === 'maintenance' ? 'maintenance' :
    business === 'maintenance' ? 'maintenance' :
    'inventory';

  return { business, management, goal: resolvedGoal };
}

export function defaultViewForGoal(goal: DemoGoal): DemoView {
  if (goal === 'customers') return 'customers';
  if (goal === 'sales') return 'deals';
  if (goal === 'maintenance') return 'maintenance';
  return 'vehicles';
}
