import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requireProductionConfig = process.argv.includes('--production-config');
const expectedProductionApiUrl = 'https://garage-link.tech';
const approvedAppIconSha256 = 'd3c29d9c6ab47e7212fed91a41e0763ec8517ba0581c4764726df9414027c3e4';
const serverRoot = resolve(root, '..', 'garage-link');
const endpoints = [
  '/api/mobile/stores',
  '/api/mobile/today',
  '/api/mobile/vehicles',
  '/api/mobile/maintenance',
  '/api/mobile/customers',
  '/api/mobile/quotes',
];
const serverRoutes = [
  'src/app/api/mobile/stores/route.ts',
  'src/app/api/mobile/today/route.ts',
  'src/app/api/mobile/vehicles/route.ts',
  'src/app/api/mobile/vehicles/[vehicleId]/route.ts',
  'src/app/api/mobile/vehicles/[vehicleId]/status/route.ts',
  'src/app/api/mobile/maintenance/route.ts',
  'src/app/api/mobile/maintenance/[jobId]/route.ts',
  'src/app/api/mobile/customers/route.ts',
  'src/app/api/mobile/customers/[customerId]/route.ts',
  'src/app/api/mobile/quotes/route.ts',
  'src/app/api/mobile/quotes/[quoteId]/route.ts',
  'src/lib/mobile/bearerAuth.ts',
  'src/lib/mobile/dto.ts',
  'src/lib/mobile/quoteService.ts',
];

const source = (path) => readFile(resolve(root, path), 'utf8');
const serverSource = (path) => readFile(resolve(serverRoot, path), 'utf8');
const failures = [];
const [configRaw, client, app, icon, fullLogo, ...serverFiles] = await Promise.all([
  source('app.json'),
  source('src/mobileApi.ts'),
  source('App.tsx'),
  readFile(resolve(root, 'assets/app-icon-ios.png')),
  readFile(resolve(root, 'assets/garage-link-logo.png')),
  ...serverRoutes.map(serverSource),
]).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
const config = JSON.parse(configRaw).expo;
const iconSha256 = createHash('sha256').update(icon).digest('hex');
const fullLogoSha256 = createHash('sha256').update(fullLogo).digest('hex');
if (config.icon !== './assets/app-icon-ios.png') failures.push('icon:not-dedicated-ios-source');
if (config.android?.adaptiveIcon?.foregroundImage !== './assets/android-icon-foreground.png') failures.push('adaptive-icon:not-android-foreground');
if (!config.android?.blockedPermissions?.includes('android.permission.RECORD_AUDIO')) failures.push('android:record-audio-not-blocked');
if (!config.android?.blockedPermissions?.includes('android.permission.SYSTEM_ALERT_WINDOW')) failures.push('android:system-alert-window-not-blocked');
if (iconSha256 !== approvedAppIconSha256) failures.push('icon:does-not-match-owner-approved-asset');
if (requireProductionConfig && process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '') !== expectedProductionApiUrl) failures.push('production-api-url:not-garage-link-tech');
if (!client.includes('MobileApiError') || !client.includes('invalid_base_url')) failures.push('client:missing-runtime-diagnostics');
if (!app.includes("console.warn('[garage-mobile-api]'")) failures.push('qa-log:missing-http-diagnostics');
if (!app.includes("require('./assets/garage-link-logo.png')")) failures.push('full-logo:login-missing-official-asset');
if (!app.includes('const [authResolved, setAuthResolved] = useState(false);') || !app.includes('if (!authResolved) return <SessionRestoring />;') || !app.includes('setAuthResolved(true);')) failures.push('session-restore:login-can-render-before-resolution');
if ((app.match(/<ListState /g) ?? []).length < 5) failures.push('list-state:missing-error-empty-gate');
if ((app.match(/error=\{null\}/g) ?? []).length < 4) failures.push('list-state:screen-can-double-render-error');
for (const page of ['stores', 'today', 'vehicles', 'vehicleDetail', 'maintenance', 'maintenanceDetail', 'customers', 'customerDetail', 'quoteCreate', 'quotePreview']) if (!app.includes(`page === '${page}'`)) failures.push(`screen:missing:${page}`);
for (const state of ['ActivityIndicator', 'EmptyState', 'ErrorNotice', 'SafeAreaView', 'TextInput']) if (!app.includes(state)) failures.push(`render-state:missing:${state}`);
if (!app.includes('SafeAreaProvider')) failures.push('safe-area:provider-missing');
if (!app.includes('bottomTabs') || !app.includes('accessibilityRole="tablist"')) failures.push('navigation:fixed-bottom-tabs-missing');
if (app.includes('return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}')) failures.push('navigation:legacy-horizontal-scroll-present');
if (!app.includes("navButton: { flex: 1") || !app.includes("minHeight: 50")) failures.push('navigation:tab-sizing-missing');
for (const endpoint of endpoints) if (!client.includes(endpoint)) failures.push(`client:missing:${endpoint}`);
for (let index = 0; index < serverRoutes.length; index += 1) if (!serverFiles[index]) failures.push(`server:missing:${serverRoutes[index]}`);
if (!serverFiles[11].includes('getGarageMobileBearerContext') || !serverFiles[11].includes('listGarageMobileStores')) failures.push('server:missing-bearer-revalidation');
const dtoAllowlists = serverFiles[12]
  .split('\n')
  .filter((line) => line.startsWith('export const MOBILE_') && line.includes('_FIELDS'))
  .join('\n');
if (/purchase_price|cost_price|profit|margin/i.test(dtoAllowlists)) failures.push('dto:financial-field-leakage');

const baseUrl = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '');
const token = process.env.GARAGE_MOBILE_QA_BEARER_TOKEN;
const storeId = process.env.GARAGE_MOBILE_QA_STORE_ID;
const runtime = [];
if (process.argv.includes('--runtime')) {
  if (!baseUrl || !/^https:\/\//.test(baseUrl) || /localhost|127\.0\.0\.1/.test(baseUrl)) failures.push('runtime:invalid-production-base-url');
  if (!token) failures.push('runtime:missing-qa-bearer');
  if (!storeId) failures.push('runtime:missing-qa-store-id');
  if (!failures.length) {
    for (const endpoint of endpoints) {
      const headers = { Authorization: `Bearer ${token}`, ...(endpoint === '/api/mobile/stores' ? {} : { 'x-garage-store-id': storeId }) };
      const response = await fetch(`${baseUrl}${endpoint}`, { headers });
      runtime.push({ endpoint, status: response.status });
      if (!response.ok) failures.push(`runtime:${endpoint}:${response.status}`);
    }
  }
}

console.log(JSON.stringify({ gate: 'GARAGE_LINK_PRE_OWNER_GATE', iconSha256, fullLogoSha256, apiBaseUrl: requireProductionConfig ? baseUrl : 'not-checked', authResolvedGate: !failures.some((failure) => failure.startsWith('session-restore:')), errorEmptySeparationGate: !failures.some((failure) => failure.startsWith('list-state:')), systemAlertWindowBlocked: config.android?.blockedPermissions?.includes('android.permission.SYSTEM_ALERT_WINDOW') === true, runtime, failures }, null, 2));
if (failures.length) process.exitCode = 1;
