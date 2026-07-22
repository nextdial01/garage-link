export const PRIMARY_TAB_KEYS = ['home', 'vehicles', 'deals', 'customers', 'maintenance', 'appointments', 'inquiries', 'menu'] as const;

export type PrimaryTabKey = (typeof PRIMARY_TAB_KEYS)[number];

export type SalesRecognitionBasis = 'contract' | 'delivery' | 'invoice';
export type PurchaseRecognitionBasis = 'purchase_confirmed' | 'stock_in' | 'supplier_invoice';

export type StoreUiPreferences = {
  primaryNavigationTabs: PrimaryTabKey[];
  salesRecognitionBasis: SalesRecognitionBasis;
  purchaseRecognitionBasis: PurchaseRecognitionBasis;
  longStayThresholdDays: number;
};

export const DEFAULT_PRIMARY_TABS: PrimaryTabKey[] = ['home', 'vehicles', 'deals', 'customers', 'menu'];

export const SALES_RECOGNITION_OPTIONS: Array<{ value: SalesRecognitionBasis; label: string; description: string }> = [
  { value: 'delivery', label: '納車日', description: '迷った場合のおすすめ。売上の計上時点が分かりやすいです。' },
  { value: 'contract', label: '成約日', description: '契約を確定した日で売上を見たい店舗向けです。' },
  { value: 'invoice', label: '請求書発行日', description: '請求の発行日で管理したい店舗向けです。' },
];

export const PURCHASE_RECOGNITION_OPTIONS: Array<{ value: PurchaseRecognitionBasis; label: string; description: string }> = [
  { value: 'purchase_confirmed', label: '仕入確定日', description: '買取契約日や落札日で見たい店舗向けです。' },
  { value: 'stock_in', label: '入庫日', description: '実際に車両が入った日で見たい店舗向けです。' },
  { value: 'supplier_invoice', label: '仕入請求書日', description: '仕入先の請求処理に合わせたい店舗向けです。' },
];

export const PRIMARY_TAB_OPTIONS: Array<{ key: PrimaryTabKey; label: string; shortLabel: string; href: string; description: string }> = [
  { key: 'home', label: 'ホーム', shortLabel: 'ホーム', href: '/dashboard', description: '今日の対応と重要な数字を確認します。' },
  { key: 'vehicles', label: '車両', shortLabel: '車両', href: '/vehicles', description: '車両在庫と掲載状況を確認します。' },
  { key: 'deals', label: '商談', shortLabel: '商談', href: '/deals', description: '商談の進捗と次回対応を管理します。' },
  { key: 'customers', label: '顧客', shortLabel: '顧客', href: '/customers', description: '顧客情報と次回対応を確認します。' },
  { key: 'maintenance', label: '整備', shortLabel: '整備', href: '/maintenance', description: '整備案件と納車予定を確認します。' },
  { key: 'appointments', label: '予約', shortLabel: '予約', href: '/appointments', description: '来店・試乗・整備予約を確認します。' },
  { key: 'inquiries', label: '問い合わせ', shortLabel: '問合せ', href: '/inquiries', description: 'L-LINK経由の問い合わせを確認します。' },
  { key: 'menu', label: 'メニュー', shortLabel: 'メニュー', href: '/menu', description: '主タブ以外の機能をまとめて開きます。' },
];

export function sanitizePrimaryTabs(input: string[] | null | undefined): PrimaryTabKey[] {
  const source = input ?? [];
  const filtered = source.filter((value): value is PrimaryTabKey => PRIMARY_TAB_KEYS.includes(value as PrimaryTabKey));
  const unique = Array.from(new Set(filtered));
  const withMenu = unique.includes('menu') ? unique : [...unique, 'menu'];
  return withMenu.slice(0, 5) as PrimaryTabKey[];
}

export function resolvePrimaryTabs(input: string[] | null | undefined): PrimaryTabKey[] {
  const sanitized = sanitizePrimaryTabs(input);
  return sanitized.length > 0 ? sanitized : DEFAULT_PRIMARY_TABS;
}

export function getPrimaryTabMeta(key: PrimaryTabKey) {
  return PRIMARY_TAB_OPTIONS.find((item) => item.key === key) ?? PRIMARY_TAB_OPTIONS[0];
}

export type MenuLinkItem = {
  key: string;
  label: string;
  href: string;
  primaryTabKey?: PrimaryTabKey;
};

export const MENU_GROUPS: Array<{ title: string; items: MenuLinkItem[] }> = [
  {
    title: '日常業務',
    items: [
      { key: 'home', label: 'ホーム', href: '/dashboard', primaryTabKey: 'home' },
      { key: 'appointments', label: '来店・試乗予約', href: '/appointments', primaryTabKey: 'appointments' },
      { key: 'deals', label: '商談', href: '/deals', primaryTabKey: 'deals' },
      { key: 'customers', label: '顧客', href: '/customers', primaryTabKey: 'customers' },
      { key: 'maintenance', label: '整備・車検', href: '/maintenance', primaryTabKey: 'maintenance' },
      { key: 'inquiries', label: '問い合わせ', href: '/inquiries', primaryTabKey: 'inquiries' },
    ],
  },
  {
    title: '書類・在庫',
    items: [
      { key: 'vehicles', label: '車両', href: '/vehicles', primaryTabKey: 'vehicles' },
      { key: 'vehicle-management', label: '入庫・出庫管理', href: '/vehicle-management' },
      { key: 'parts', label: '部品管理', href: '/parts' },
      { key: 'quotes', label: '見積書', href: '/quotes' },
      { key: 'invoices', label: '請求書', href: '/invoices' },
      { key: 'inventory-counts', label: '棚卸し', href: '/inventory-counts' },
      { key: 'analytics', label: '分析', href: '/analytics' },
    ],
  },
  {
    title: '設定',
    items: [
      { key: 'settings', label: '設定トップ', href: '/settings' },
      { key: 'store-settings', label: '店舗設定', href: '/settings/store' },
      { key: 'company-settings', label: '会社情報・帳票設定', href: '/settings/company' },
      { key: 'member-settings', label: 'メンバー・権限設定', href: '/settings/members' },
      { key: 'inspection-settings', label: '車検案内設定', href: '/settings/customer-follow-up/inspection-reminders' },
      { key: 'billing-settings', label: 'プラン・契約', href: '/settings/billing' },
    ],
  },
];

export function filterMenuGroupsByRole(role: string) {
  const hideSettings = role === 'viewer' || role === 'staff';
  const limitedForImplementer = role === 'implementer';

  return MENU_GROUPS.map((group) => {
    if (group.title !== '設定') {
      return group;
    }

    if (hideSettings) {
      return { ...group, items: [] };
    }

    if (!limitedForImplementer) {
      return group;
    }

    return {
      ...group,
      items: group.items.filter((item) => item.href === '/settings'),
    };
  }).filter((group) => group.items.length > 0);
}
