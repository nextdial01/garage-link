import { useEffect, useEffectEvent, useMemo, useRef, useState, createContext, useContext } from 'react';
import { ActivityIndicator, AppState, BackHandler, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { buttonLayout, createRequestCoordinator, mergePage, parentTab, quoteValidationError, quoteVehicleId, userFacingError } from './src/qualityState';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { MobileApiError, mobileApi, type Customer, type CustomerDetail, type MaintenanceJob, type Quote, type QuoteDraft, type Store, type Today, type Vehicle, type VehicleDetail } from './src/mobileApi';
import { localSignOutScope, sessionAfterAuthEvent, shouldRefreshForAppState } from './src/authLifecycle';
import { mobileConfigurationError, supabase } from './src/supabase';

type Page = 'stores' | 'today' | 'vehicles' | 'vehicleDetail' | 'maintenance' | 'maintenanceDetail' | 'customers' | 'customerDetail' | 'quotes' | 'quoteCreate' | 'quotePreview';
const operationKey = () => 'native-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
const yen = (value: number | null | undefined) => typeof value === 'number' ? value.toLocaleString('ja-JP') + '円' : '-';
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const escapeHtml = (value: string | null | undefined) => (value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
const roleLabel = (role: string | null | undefined) => ({ owner: 'オーナー', admin: '管理者', implementer: '担当者', staff: 'スタッフ', viewer: '閲覧のみ' })[role ?? ''] ?? 'スタッフ';
const statusLabel = (status: string | null | undefined) => ({ received: '受付', estimating: '見積中', waiting: '入庫待ち', delivered: '納車済み', in_stock: '在庫中', working: '作業中', completed: '完了', available: '在庫中', maintenance: '整備中', draft: '下書き', sent: '提示済み', accepted: '承認済み', rejected: '見送り', expired: '期限切れ', cancelled: '取消', scheduled: '予定', pending: '確認待ち', in_progress: '進行中' })[status ?? ''] ?? status ?? '-';

const jobTypeLabel = (value: string | null | undefined) => ({ inspection: '車検・点検' })[value ?? ''] ?? value ?? '-';

const displayError = userFacingError;
const BusyContext = createContext(false);

export default function App() {
  return <SafeAreaProvider><GarageMobileApp /></SafeAreaProvider>;
}

export function GarageMobileApp() {
  const { width } = useWindowDimensions();
  const tablet = width >= 720;
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [page, setPage] = useState<Page>('stores');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [jobs, setJobs] = useState<MaintenanceJob[]>([]);
  const [job, setJob] = useState<MaintenanceJob | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [quoteVehicle, setQuoteVehicle] = useState('');
  const [vehicleOffset, setVehicleOffset] = useState<number | null>(null);
  const [customerOffset, setCustomerOffset] = useState<number | null>(null);
  const [maintenanceOffset, setMaintenanceOffset] = useState<number | null>(null);
  const [quoteOffset, setQuoteOffset] = useState<number | null>(null);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [requests] = useState(createRequestCoordinator);
  const live = useRef(true);
  const pending = useRef(new Set<ReturnType<typeof requests.begin>>());
  const [mutating, setMutating] = useState(false);
  const retry = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminOtpRequired, setAdminOtpRequired] = useState(false);
  const [adminOtpSent, setAdminOtpSent] = useState(false);
  const [adminOtpCode, setAdminOtpCode] = useState('');
  const [quoteTitle, setQuoteTitle] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [quoteValidation, setQuoteValidation] = useState<ReturnType<typeof quoteValidationError>>(null);
  const itemNameRef = useRef<TextInput>(null);
  const itemPriceRef = useRef<TextInput>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(operationKey());
  const [maintenanceIdempotencyKey, setMaintenanceIdempotencyKey] = useState(operationKey());


  async function run<T>(task: (isCurrent: () => boolean) => Promise<T>, mutation = false) {
    if (!mutation && requests.mutationPending()) return undefined;
    const ticket = mutation ? requests.beginMutation() : requests.begin('navigation');
    if (!ticket) return undefined;
    pending.current.add(ticket);
    setLoading(true); setError(null);
    if (mutation) setMutating(true);
    try {
      const result = await task(() => live.current && requests.current(ticket));
      return live.current && requests.current(ticket) ? result : undefined;
    } catch (reason) {
      if (!live.current || !requests.current(ticket)) return undefined;
      if (reason instanceof MobileApiError) console.warn('[garage-mobile-api]', { status: reason.status, code: reason.code });
      if (reason instanceof MobileApiError && reason.code === 'admin_security_required') {
        setAdminOtpRequired(true); setError(null); return undefined;
      }
      setError(displayError(reason));
      return undefined;
    } finally {
      pending.current.delete(ticket);
      if (mutation) requests.finishMutation(ticket);
      if (live.current) {
        setLoading([...pending.current].some((item) => requests.current(item as typeof ticket)));
        if (mutation && requests.current(ticket)) setMutating(false);
      }
    }
  }
  async function loadStores() {
    retry.current = () => void loadStores();
    const next = await run(() => mobileApi.stores());
    if (next) { setStores(next); if (next.length === 1) await selectStore(next[0], next); }
  }
  async function requestAdminOtp() {
    const result = await run(() => mobileApi.requestAdminEmailOtp(), true);
    if (result) setAdminOtpSent(true);
  }
  async function verifyAdminOtp() {
    if (!/^\d{6}$/.test(adminOtpCode)) { setError('6桁の確認コードを入力してください。'); return; }
    const verified = await run(() => mobileApi.verifyAdminEmailOtp(adminOtpCode), true);
    if (!verified) return;
    setAdminOtpRequired(false);
    setAdminOtpSent(false);
    setAdminOtpCode('');
    await loadStores();
  }
  function resetLocalState() {
    setVehicleOffset(null); setCustomerOffset(null); setMaintenanceOffset(null); setQuoteOffset(null); setVehicleQuery(''); setCustomerQuery('');
    requests.invalidate(); pending.current.clear(); retry.current = null; setMutating(false);
    setStore(null); setStores([]); setPage('stores'); setVehicles([]); setVehicle(null); setToday(null); setJobs([]); setJob(null); setCustomers([]); setCustomer(null); setQuotes([]); setQuote(null); setVehicleSearch(''); setCustomerSearch(''); setQuoteVehicle(''); setError(null); setLoading(false); setAdminOtpRequired(false); setAdminOtpSent(false); setAdminOtpCode(''); setQuoteTitle(''); setItemName(''); setItemPrice(''); setQuoteValidation(null);
  }
  function openStorePicker() {
    if (requests.mutationPending()) return;
    const available = stores; resetLocalState(); setStores(available);
  }
  async function logout() {
    resetLocalState();
    const { error: signOutError } = await supabase.auth.signOut(localSignOutScope);
    if (signOutError) setError(displayError(signOutError));
  }
  async function selectStore(next: Store, available = stores) {
    if (requests.mutationPending()) return;
    resetLocalState(); setStores(available);
    retry.current = () => void selectStore(next, available);
    const selected = await run(() => mobileApi.selectStore(next), true);
    if (!selected) return;
    setStore(selected); await openToday(selected);
  }
  async function openToday(target = store) {
    if (!target) return;
    retry.current = () => void openToday(target);
    const next = await run(() => mobileApi.today(target.id));
    if (next) { setToday(next); setPage('today'); }
  }
  async function openVehicles(query = vehicleSearch) {
    if (!store) return;
    retry.current = () => void openVehicles(query);
    const next = await run(() => mobileApi.vehiclesPage(store.id, query.trim()));
    if (next) { setVehicles(next.vehicles); setVehicleOffset(next.nextOffset ?? null); setVehicleQuery(query.trim()); setPage('vehicles'); }
  }
  async function openVehicle(next: Vehicle) {
    if (!store) return;
    retry.current = () => void openVehicle(next);
    const loaded = await run(() => mobileApi.detail(store.id, next.id));
    if (loaded) { setVehicle(loaded); setPage('vehicleDetail'); }
  }
  async function changeVehicleStatus(status: string) {
    if (!store || !vehicle) return;
    const next = await run(() => mobileApi.updateStatus(store.id, vehicle.vehicle.id, status), true);
    if (next) setVehicle({ ...vehicle, vehicle: next });
  }
  async function addPhoto(camera: boolean) {
    if (!store || !vehicle) return;
    const targetStore = store; const targetVehicle = vehicle.vehicle;
    const uploaded = await run(async (isCurrent) => {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!isCurrent()) return null;
      if (!permission.granted) throw new MobileApiError('permission denied', 'photo', 403, 'photo_permission');
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !isCurrent()) return null;
      return mobileApi.uploadVehicleImage(targetStore.id, targetVehicle.id, result.assets[0]);
    }, true);
    if (uploaded) await openVehicle(targetVehicle);
  }
  async function openMaintenance() {
    if (!store) return;
    retry.current = () => void openMaintenance();
    const next = await run(() => mobileApi.maintenancePage(store.id));
    if (next) { setJobs(next.jobs); setMaintenanceOffset(next.nextOffset ?? null); setPage('maintenance'); }
  }
  async function openJob(next: Pick<MaintenanceJob, 'id'>) {
    if (!store) return;
    retry.current = () => void openJob(next);
    const loaded = await run(() => mobileApi.maintenanceDetail(store.id, next.id));
    if (loaded) { setJob(loaded); setMaintenanceIdempotencyKey(operationKey()); setPage('maintenanceDetail'); }
  }
  async function updateJob(status: string) {
    if (!store || !job) return;
    const next = await run(() => mobileApi.updateMaintenance(store.id, job.id, status, maintenanceIdempotencyKey), true);
    if (next) { setJob(next); setMaintenanceIdempotencyKey(operationKey()); }
  }
  async function openCustomers(query = customerSearch) {
    if (!store) return;
    retry.current = () => void openCustomers(query);
    const next = await run(() => mobileApi.customersPage(store.id, query.trim()));
    if (next) { setCustomers(next.customers); setCustomerOffset(next.nextOffset ?? null); setCustomerQuery(query.trim()); setPage('customers'); }
  }
  async function openCustomer(next: Customer) {
    if (!store) return;
    retry.current = () => void openCustomer(next);
    const loaded = await run(() => mobileApi.customerDetail(store.id, next.id));
    if (loaded) { setCustomer(loaded); setPage('customerDetail'); }
  }
  async function openQuotes() {
    if (!store) return;
    retry.current = () => void openQuotes();
    const next = await run(() => mobileApi.quotesPage(store.id));
    if (next) { setQuotes(next.quotes); setQuoteOffset(next.nextOffset ?? null); setPage('quotes'); }
  }
  async function loadMore(kind: 'vehicles' | 'customers' | 'maintenance' | 'quotes') {
    if (!store || loading) return;
    retry.current = () => void loadMore(kind);
    if (kind === 'vehicles' && vehicleOffset !== null) {
      const next = await run(() => mobileApi.vehiclesPage(store.id, vehicleQuery, vehicleOffset));
      if (next) { setVehicles((current) => mergePage(current, next.vehicles)); setVehicleOffset(next.nextOffset ?? null); }
    } else if (kind === 'customers' && customerOffset !== null) {
      const next = await run(() => mobileApi.customersPage(store.id, customerQuery, customerOffset));
      if (next) { setCustomers((current) => mergePage(current, next.customers)); setCustomerOffset(next.nextOffset ?? null); }
    } else if (kind === 'maintenance' && maintenanceOffset !== null) {
      const next = await run(() => mobileApi.maintenancePage(store.id, maintenanceOffset));
      if (next) { setJobs((current) => mergePage(current, next.jobs)); setMaintenanceOffset(next.nextOffset ?? null); }
    } else if (kind === 'quotes' && quoteOffset !== null) {
      const next = await run(() => mobileApi.quotesPage(store.id, quoteOffset));
      if (next) { setQuotes((current) => mergePage(current, next.quotes)); setQuoteOffset(next.nextOffset ?? null); }
    }
  }
  function startQuote() { setError(null); retry.current = null; setQuoteVehicle(''); setQuoteTitle(''); setItemName(''); setItemPrice(''); setQuoteValidation(null); setIdempotencyKey(operationKey()); setPage('quoteCreate'); }
  async function saveQuote() {
    if (!store || !customer) { setError('見積を作成する顧客を選択してください。'); return; }
    const validation = quoteValidationError(itemName, itemPrice);
    if (validation) {
      setQuoteValidation(validation);
      requestAnimationFrame(() => (validation.field === 'itemName' ? itemNameRef : itemPriceRef).current?.focus());
      return;
    }
    setQuoteValidation(null);
    const unitPrice = Number(itemPrice);
    const draft: QuoteDraft = { title: quoteTitle.trim() || undefined, customerId: customer.customer.id, vehicleId: quoteVehicleId(quoteVehicle, customer.vehicles), issueDate: new Date().toISOString().slice(0, 10), items: [{ itemType: 'service', name: itemName.trim(), quantity: 1, unitPrice, taxRate: 0.1 }] };
    retry.current = () => void saveQuote();
    const saved = await run(() => mobileApi.createQuote(store.id, idempotencyKey, draft), true);
    if (saved) { setQuote(saved); setPage('quotePreview'); }
  }
  async function openQuote(next: Quote) {
    if (!store) return;
    retry.current = () => void openQuote(next);
    const loaded = await run(() => mobileApi.quoteDetail(store.id, next.id));
    if (loaded) { setQuote(loaded); setPage('quotePreview'); }
  }
  const resetForAuth = useEffectEvent(() => resetLocalState());
  const bootstrapAccount = useEffectEvent(() => { resetLocalState(); void loadStores(); });
  useEffect(() => {
    let mounted = true; live.current = true;
    void supabase.auth.getSession()
      .then(({ data }) => { if (mounted) setSession(data.session); }).catch(() => { if (mounted) setError('ログイン状態を確認できません。再度ログインしてください。'); })
      .finally(() => { if (mounted) setAuthResolved(true); });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      // Only an explicit server-side sign-out may clear the persisted local
      // session. A temporary refresh or network failure must keep the user in
      // the app and allow the next foreground refresh or retry to recover.
      if (event === 'SIGNED_OUT') resetForAuth();
      setSession((current) => sessionAfterAuthEvent(current, event, next));
      setAuthResolved(true);
    });
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (shouldRefreshForAppState(nextAppState)) {
        supabase.auth.startAutoRefresh();
        // getSession reads the persisted session and performs a silent refresh
        // when necessary. It intentionally does not clear the current session
        // when a transient refresh attempt cannot reach the network.
        void supabase.auth.getSession().then(({ data: next }) => {
          if (mounted && next.session) setSession(next.session);
        }).catch(() => undefined);
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    if (shouldRefreshForAppState(AppState.currentState)) supabase.auth.startAutoRefresh();
    return () => { mounted = false; live.current = false; requests.invalidate(); appStateSubscription.remove(); supabase.auth.stopAutoRefresh(); data.subscription.unsubscribe(); };
  }, [requests]);
  // Synchronize an external auth identity: clear previous-account data before fetching the new scope.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (session?.user.id) bootstrapAccount(); }, [session?.user.id]);


  const quoteHtml = useMemo(() => {
    if (!quote) return '';
    const items = quote.items.map((item) => '<p>' + escapeHtml(item.name) + '　' + item.quantity + ' × ' + yen(item.unitPrice) + '　= ' + yen(item.amount) + '</p>').join('');
    return '<html><body style="font-family:-apple-system,Arial;padding:28px;color:#102A43"><h1>御見積書</h1><p>見積番号: ' + escapeHtml(quote.quoteNo) + '</p><p>宛先: ' + escapeHtml(quote.customerName) + ' ' + escapeHtml(quote.customerHonorific || '様') + '</p><p>車両: ' + escapeHtml(quote.vehicleLabel) + '</p><hr/>' + items + '<hr/><h2>合計: ' + yen(quote.totalAmount) + '</h2><p>発行日: ' + escapeHtml(quote.issueDate) + '</p></body></html>';
  }, [quote]);
  async function exportPdf() {
    if (!quote) return;
    await run(async (isCurrent) => {
      const result = await Print.printToFileAsync({ html: quoteHtml });
      if (!isCurrent()) return;
      if (!await Sharing.isAvailableAsync()) throw new MobileApiError('Sharing unavailable', 'share', 0, 'share_unavailable');
      if (isCurrent()) await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: '見積書を保存・共有' });
    }, true);
  }
  async function printQuote() { if (quote) await run(() => Print.printAsync({ html: quoteHtml }), true); }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mutating) return true;
      const parent = parentTab(page);
      if (parent !== page) { requests.begin('navigation'); setLoading(false); setError(null); setPage(parent as Page); return true; }
      if (page !== 'stores' && page !== 'today') { requests.begin('navigation'); setLoading(false); setError(null); setPage('today'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [page, mutating, requests]);
  const screenProps = { loading, onRetry: () => retry.current?.(), mutating, storeLabel: store?.name };
  const nav = <Nav disabled={mutating} active={page} onToday={() => void openToday()} onVehicles={() => void openVehicles()} onMaintenance={() => void openMaintenance()} onCustomers={() => void openCustomers()} onQuotes={() => void openQuotes()} />;

  if (mobileConfigurationError) return <Centered message={mobileConfigurationError} />;
  if (!authResolved) return <SessionRestoring />;
  if (!session) return <Login email={email} password={password} error={error} loading={loading} onEmail={setEmail} onPassword={setPassword} onLogin={() => void run(async () => { const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (authError) throw authError; setPassword(''); }, true)} />;
  if (adminOtpRequired) return <AdminOtp onLogout={() => void logout()} emailCode={adminOtpCode} sent={adminOtpSent} error={error} loading={loading} onCode={setAdminOtpCode} onRequest={() => void requestAdminOtp()} onVerify={() => void verifyAdminOtp()} />;
  if (page === 'stores') return <SafeAreaView style={styles.screen}><Header title="店舗を選択" onLogout={() => void logout()} /><View style={styles.storeContent}><View style={styles.intro}><Text style={styles.eyebrow}>STORE</Text><Text style={styles.lead}>利用する店舗を選択してください。</Text></View><ListState loading={loading} error={error} onRetry={() => void loadStores()}><FlatList data={stores} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <EntityRow title={item.name} subtitle={roleLabel(item.role)} onPress={() => void selectStore(item)} />} ListEmptyComponent={<EmptyState title="利用可能な店舗がありません" description="管理者へアクセス権をご確認ください。" />} /></ListState></View></SafeAreaView>;
  if (page === 'today') return <Screen {...screenProps} title="今日" onStore={openStorePicker} onLogout={() => void logout()} nav={nav} error={error}><TodayScreen today={today} onJob={(id) => void openJob({ id })} onMaintenance={() => void openMaintenance()} tablet={tablet} /></Screen>;
  if (page === 'vehicleDetail' && vehicle && store) return <Screen {...screenProps} title="車両詳細" onBack={() => void openVehicles()} nav={nav} error={error}><ScrollView contentContainerStyle={tablet ? styles.tabletDetail : styles.detail}><DetailHero title={[vehicle.vehicle.maker, vehicle.vehicle.modelName].filter(Boolean).join(' ') || '車両'} status={vehicle.vehicle.status} /><InfoRow label="管理番号" value={vehicle.vehicle.managementNo || '-'} /><InfoRow label="登録番号" value={vehicle.vehicle.registrationNo || '-'} /><InfoRow label="走行距離" value={vehicle.vehicle.mileageKm == null ? '-' : vehicle.vehicle.mileageKm.toLocaleString('ja-JP') + ' km'} /><InfoRow label="保管場所" value={vehicle.vehicle.locationName || '-'} /><SectionLabel label="状態を更新" /><View style={styles.actions}><ActionButton disabled={store.role === 'viewer'} title="在庫中" onPress={() => void changeVehicleStatus('在庫中')} variant="secondary" /><ActionButton disabled={store.role === 'viewer'} title="整備中" onPress={() => void changeVehicleStatus('整備中')} variant="secondary" /></View><SectionLabel label="写真" /><View style={styles.actions}><ActionButton disabled={store.role === 'viewer'} title="カメラで追加" onPress={() => void addPhoto(true)} /><ActionButton disabled={store.role === 'viewer'} title="写真から追加" onPress={() => void addPhoto(false)} variant="secondary" /></View>{vehicle.imageFiles.map((item) => <SignedImage key={item.id} storeId={store.id} fileId={item.id} />)}{!vehicle.imageFiles.length && <EmptyState title="画像はまだありません" description="カメラまたは写真ライブラリから追加できます。" compact />}</ScrollView></Screen>;
  if (page === 'vehicles') return <Screen {...screenProps} title="車両" onStore={openStorePicker} nav={nav} error={error}><Search placeholder="車名・管理番号で検索" value={vehicleSearch} onChange={setVehicleSearch} onClear={() => { setVehicleSearch(''); void openVehicles(''); }} onSearch={() => void openVehicles()} /><ListState loading={loading && vehicles.length === 0} error={null} onRetry={() => void openVehicles()}><FlatList ListFooterComponent={<PageFooter count={vehicles.length} more={vehicleOffset !== null} loading={loading} onMore={() => void loadMore('vehicles')} />} data={vehicles} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openVehicles()} renderItem={({ item }) => <EntityRow title={[item.maker, item.modelName].filter(Boolean).join(' ') || item.managementNo || '名称未設定'} subtitle={[item.managementNo || '管理番号未設定', item.registrationNo, item.mileageKm == null ? null : item.mileageKm.toLocaleString('ja-JP') + ' km'].filter(Boolean).join(' · ')} right={<StatusChip value={item.status} />} onPress={() => void openVehicle(item)} />} ListEmptyComponent={<EmptyState title={vehicleSearch.trim() ? "条件に一致する車両はありません" : "車両がありません"} description={vehicleSearch.trim() ? "車名・管理番号を確認するか、検索条件を解除してください。" : "Web版で車両を登録すると、この店舗の車両がここに表示されます。"} />} /></ListState></Screen>;
  if (page === 'maintenanceDetail' && job) return <Screen {...screenProps} title="整備詳細" onBack={() => void openMaintenance()} nav={nav} error={error}><ScrollView contentContainerStyle={styles.detail}><DetailHero title={job.vehicleLabel || job.job_no || '整備案件'} status={job.status} />{job.customerName && <InfoRow label="顧客" value={job.customerName} />}<InfoRow label="案件番号" value={job.job_no || '-'} /><InfoRow label="種別" value={jobTypeLabel(job.job_type)} /><InfoRow label="納車予定" value={date(job.scheduled_delivery_at)} /><InfoRow label="担当" value={job.assigned_user_name || '-'} /><SectionLabel label="状態を更新" /><View style={styles.statusActions}><ActionButton disabled={store?.role === 'viewer'} title="受付" onPress={() => void updateJob('received')} variant="secondary" /><ActionButton disabled={store?.role === 'viewer'} title="作業中" onPress={() => void updateJob('working')} variant="secondary" /><ActionButton disabled={store?.role === 'viewer'} title="完了" onPress={() => void updateJob('completed')} /></View></ScrollView></Screen>;
  if (page === 'maintenance') return <Screen {...screenProps} title="整備・車検" onStore={openStorePicker} nav={nav} error={error}><ListState loading={loading && jobs.length === 0} error={null} onRetry={() => void openMaintenance()}><FlatList ListFooterComponent={<PageFooter count={jobs.length} more={maintenanceOffset !== null} loading={loading} onMore={() => void loadMore('maintenance')} />} data={jobs} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openMaintenance()} renderItem={({ item }) => <EntityRow title={item.vehicleLabel || item.job_no || '整備案件'} subtitle={[item.customerName, item.job_no ? `案件 ${item.job_no}` : null, jobTypeLabel(item.job_type), '納車予定 ' + date(item.scheduled_delivery_at)].filter(Boolean).join(' · ')} right={<StatusChip value={item.status} />} onPress={() => void openJob(item)} />} ListEmptyComponent={<EmptyState title="整備案件がありません" description="今日の作業予定はここに表示されます。" />} /></ListState></Screen>;
  if (page === 'customerDetail' && customer) return <Screen {...screenProps} title="顧客詳細" onBack={() => void openCustomers()} nav={nav} error={error}><ScrollView contentContainerStyle={tablet ? styles.tabletDetail : styles.detail}><DetailHero title={customer.customer.name || '顧客'} /><InfoRow label="電話番号" value={customer.customer.phone || customer.customer.mobile_phone || '-'} /><InfoRow label="メール" value={customer.customer.email || '-'} /><InfoRow label="住所" value={customer.customer.address || '-'} /><SectionLabel label="紐づく車両" />{customer.vehicles.length ? customer.vehicles.map((item) => <EntityRow key={item.id} title={[item.maker, item.modelName].filter(Boolean).join(' ') || '車両'} subtitle={item.managementNo || '管理番号未設定'} onPress={() => void openVehicle(item)} />) : <Text style={styles.muted}>登録車両はありません。</Text>}<SectionLabel label="整備案件" />{customer.maintenance.length ? customer.maintenance.map((item) => <EntityRow key={item.id} title={item.job_no || '整備案件'} subtitle={statusLabel(item.status)} onPress={() => void openJob(item)} />) : <Text style={styles.muted}>整備案件はありません。</Text>}<View style={styles.primaryAction}><ActionButton disabled={store?.role === 'viewer'} title="この顧客の見積を作成" onPress={startQuote} /></View></ScrollView></Screen>;
  if (page === 'customers') return <Screen {...screenProps} title="顧客" onStore={openStorePicker} nav={nav} error={error}><Search placeholder="顧客名・電話番号で検索" value={customerSearch} onChange={setCustomerSearch} onClear={() => { setCustomerSearch(''); void openCustomers(''); }} onSearch={() => void openCustomers()} /><ListState loading={loading && customers.length === 0} error={null} onRetry={() => void openCustomers()}><FlatList ListFooterComponent={<PageFooter count={customers.length} more={customerOffset !== null} loading={loading} onMore={() => void loadMore('customers')} />} data={customers} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openCustomers()} renderItem={({ item }) => <EntityRow title={item.name || '名称未設定'} subtitle={item.phone || item.mobile_phone || '電話番号未設定'} onPress={() => void openCustomer(item)} />} ListEmptyComponent={<EmptyState title={customerSearch.trim() ? "条件に一致する顧客はありません" : "顧客がありません"} description={customerSearch.trim() ? "顧客名・電話番号を確認するか、検索条件を解除してください。" : "Web版で顧客を登録すると、この店舗の顧客がここに表示されます。"} />} /></ListState></Screen>;
  if (page === 'quoteCreate') return <Screen {...screenProps} title="見積を作成" onRetry={() => void saveQuote()} onBack={() => setPage('customerDetail')} nav={nav} error={error}><ScrollView style={styles.flex} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"><View style={styles.customerSummary}><Text style={styles.summaryLabel}>宛先</Text><Text style={styles.summaryValue}>{customer?.customer.name || '-'}</Text></View><SectionLabel label="対象車両" /><Text style={styles.muted}>この見積に関連付ける車両を選んでください。</Text><VehicleChoice selected={!quoteVehicle} title="車両を指定しない" onPress={() => setQuoteVehicle('')} />{customer?.vehicles.map((item) => <VehicleChoice key={item.id} selected={quoteVehicle === item.id} title={[item.managementNo, item.maker, item.modelName].filter(Boolean).join(' / ') || '車両'} onPress={() => setQuoteVehicle(item.id)} />) }<FieldLabel label="見積タイトル（任意）" /><TextInput style={styles.input} accessibilityLabel="見積タイトル" editable={!mutating} placeholder="例：車検整備のお見積" placeholderTextColor={colors.muted} value={quoteTitle} onChangeText={setQuoteTitle} /><FieldLabel label="販売明細名" /><TextInput ref={itemNameRef} style={[styles.input, quoteValidation?.field === 'itemName' && styles.inputError]} accessibilityLabel="販売明細名" editable={!mutating} placeholder="例：車検整備一式" placeholderTextColor={colors.muted} value={itemName} onChangeText={(value) => { setItemName(value); if (quoteValidation?.field === 'itemName') setQuoteValidation(null); }} />{quoteValidation?.field === 'itemName' && <ErrorNotice message={quoteValidation.message} />}<FieldLabel label="販売価格（税抜・円）" /><TextInput ref={itemPriceRef} style={[styles.input, quoteValidation?.field === 'itemPrice' && styles.inputError]} accessibilityLabel="販売価格（税抜・円）" editable={!mutating} placeholder="例：50000" placeholderTextColor={colors.muted} keyboardType="numeric" value={itemPrice} onChangeText={(value) => { setItemPrice(value); if (quoteValidation?.field === 'itemPrice') setQuoteValidation(null); }} />{quoteValidation?.field === 'itemPrice' && <ErrorNotice message={quoteValidation.message} />}<ActionButton title="保存してプレビュー" onPress={() => void saveQuote()} /></ScrollView></Screen>;
  if (page === 'quotePreview' && quote) return <Screen {...screenProps} title="お客様向けプレビュー" onBack={() => void openQuotes()} nav={nav} error={error}><ScrollView contentContainerStyle={tablet ? styles.tabletPreview : styles.preview}><Text style={styles.previewEyebrow}>ESTIMATE</Text><Text style={styles.previewTitle}>御見積書</Text><InfoRow label="見積番号" value={quote.quoteNo || '-'} /><InfoRow label="宛先" value={(quote.customerName || '-') + ' ' + (quote.customerHonorific || '様')} /><InfoRow label="車両" value={quote.vehicleLabel || '-'} /><View style={styles.quoteDivider} />{quote.items.map((item) => <View key={item.id || item.name} style={styles.quoteItem}><View style={styles.quoteItemName}><Text style={styles.inlineText}>{item.name}</Text><Text style={styles.muted}>{item.quantity} × {yen(item.unitPrice)}</Text></View><Text style={styles.quoteAmount}>{yen(item.amount)}</Text></View>)}<InfoRow label="小計" value={yen(quote.subtotalAmount)} /><InfoRow label="消費税" value={yen(quote.taxAmount)} /><Text style={styles.total}>合計 {yen(quote.totalAmount)}</Text><InfoRow label="発行日" value={quote.issueDate || '-'} />{quote.expiryDate && <InfoRow label="有効期限" value={quote.expiryDate} />}<View style={styles.stackActions}><ActionButton title="PDFを保存・共有" onPress={() => void exportPdf()} /><ActionButton title="印刷" onPress={() => void printQuote()} variant="ghost" /></View></ScrollView></Screen>;
  return <Screen {...screenProps} title="見積" onStore={openStorePicker} nav={nav} error={error}><ListState loading={loading && quotes.length === 0} error={null} onRetry={() => void openQuotes()}><FlatList ListFooterComponent={<PageFooter count={quotes.length} more={quoteOffset !== null} loading={loading} onMore={() => void loadMore('quotes')} />} data={quotes} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openQuotes()} renderItem={({ item }) => <EntityRow title={item.quoteNo || '見積'} subtitle={item.customerName || '宛先未設定'} right={<Text style={styles.amount}>{yen(item.totalAmount)}</Text>} onPress={() => void openQuote(item)} />} ListEmptyComponent={<EmptyState title="見積がありません" description="顧客詳細画面から新しい見積を作成できます。" />} /></ListState></Screen>;
}

function Login({ email, password, error, loading, onEmail, onPassword, onLogin }: { email: string; password: string; error: string | null; loading: boolean; onEmail: (value: string) => void; onPassword: (value: string) => void; onLogin: () => void }) {
  return <SafeAreaView style={styles.loginScreen}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled"><Image source={require('./assets/garage-link-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="GARAGE LINK" /><Text style={styles.loginTitle}>ログイン</Text><Text style={styles.loginLead}>アカウント情報を入力してください</Text><View style={styles.loginCard}><FieldLabel label="メールアドレス" /><TextInput style={styles.input} accessibilityLabel="メールアドレス" placeholder="name@example.com" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" value={email} onChangeText={onEmail} /><FieldLabel label="パスワード" /><TextInput style={styles.input} accessibilityLabel="パスワード" placeholder="パスワードを入力" placeholderTextColor={colors.muted} secureTextEntry textContentType="password" autoComplete="current-password" value={password} onChangeText={onPassword} /><ActionButton title="ログイン" onPress={onLogin} disabled={!email || !password || loading} />{error && <ErrorNotice message={error} />}</View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
function AdminOtp({ onLogout, emailCode, sent, error, loading, onCode, onRequest, onVerify }: { emailCode: string; sent: boolean; error: string | null; loading: boolean; onCode: (value: string) => void; onRequest: () => void; onVerify: () => void; onLogout: () => void }) {
  const handleCodeChange = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    onCode(next);
    if (emailCode.length < 6 && next.length === 6) Keyboard.dismiss();
  };
  return <SafeAreaView style={styles.loginScreen}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled"><Image source={require('./assets/garage-link-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="GARAGE LINK" /><Text style={styles.loginTitle}>追加の本人確認</Text><Text style={styles.loginLead}>管理者アカウントの確認コードをメールで受け取り、入力してください。</Text><View style={styles.loginCard}>{!sent ? <ActionButton title="確認コードを送信" onPress={onRequest} disabled={loading} /> : <><FieldLabel label="確認コード" /><TextInput style={styles.input} accessibilityLabel="確認コード" placeholder="6桁の確認コード" placeholderTextColor={colors.muted} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} value={emailCode} onChangeText={handleCodeChange} /><ActionButton title="確認して続ける" onPress={onVerify} disabled={loading || emailCode.length !== 6} /><ActionButton title="確認コードを再送" onPress={onRequest} disabled={loading} variant="ghost" /></>}{error && <ErrorNotice message={error} />}<ActionButton title="ログアウト" onPress={onLogout} disabled={loading} variant="ghost" /></View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
function Screen({ title, onBack, onStore, onLogout, nav, error, children, loading, onRetry, mutating, storeLabel }: { title: string; onBack?: () => void; onStore?: () => void; onLogout?: () => void; nav: React.ReactNode; error: string | null; children: React.ReactNode; loading: boolean; onRetry: () => void; mutating: boolean; storeLabel?: string }) {
  return <BusyContext.Provider value={mutating}><SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}><Header title={title} onBack={onBack || onStore} backTitle={onBack ? '戻る' : '店舗'} onLogout={onLogout} /><View style={styles.storeContext}><Ionicons name="business-outline" size={14} color={colors.muted} /><Text style={styles.storeContextText} numberOfLines={1}>{storeLabel}</Text></View><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={styles.content}>{loading && <View style={styles.progress} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.progressText}>{mutating ? '処理しています…' : '読み込んでいます…'}</Text></View>}{error && <View style={styles.inlineError}><ErrorNotice message={error} /><ActionButton title="再試行" onPress={onRetry} compact variant="secondary" /></View>}{children}</View></KeyboardAvoidingView>{nav}</SafeAreaView></BusyContext.Provider>;
}

function Header({ title, onBack, backTitle = '戻る', onLogout }: { title: string; onBack?: () => void; backTitle?: string; onLogout?: () => void }) { return <View style={styles.header}>{onBack ? <ActionButton title={backTitle} onPress={onBack} compact variant="ghost" /> : <View style={styles.headerSpacer} />}<Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>{onLogout ? <ActionButton title="ログアウト" onPress={onLogout} compact variant="ghost" /> : <View style={styles.headerSpacer} />}</View>; }
function Nav({ active, disabled, onToday, onVehicles, onMaintenance, onCustomers, onQuotes }: { active: Page; disabled: boolean; onToday: () => void; onVehicles: () => void; onMaintenance: () => void; onCustomers: () => void; onQuotes: () => void }) {
  const items: { key: Page; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void }[] = [{ key: 'today', label: '今日', icon: 'today-outline', onPress: onToday }, { key: 'vehicles', label: '車両', icon: 'car-outline', onPress: onVehicles }, { key: 'maintenance', label: '整備', icon: 'construct-outline', onPress: onMaintenance }, { key: 'customers', label: '顧客', icon: 'people-outline', onPress: onCustomers }, { key: 'quotes', label: '見積', icon: 'document-text-outline', onPress: onQuotes }];
  return <View style={styles.bottomTabs} accessibilityRole="tablist">{items.map((item) => { const selected = parentTab(active) === item.key; return <TouchableOpacity key={item.key} disabled={disabled} style={[styles.navButton, selected && styles.navButtonActive]} onPress={item.onPress} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected, disabled }} aria-selected={selected}><Ionicons name={item.icon} size={22} color={selected ? colors.primaryDark : colors.muted} /><Text numberOfLines={1} style={selected ? styles.navTextActive : styles.navText}>{item.label}</Text></TouchableOpacity>; })}</View>;
}

function TodayScreen({ today, onMaintenance, onJob, tablet }: { today: Today | null; onMaintenance: () => void; onJob: (id: string) => void; tablet: boolean }) {
  if (!today) return <Centered message="今日の予定を読み込んでいます。" />;
  const groups: [string, Today['appointments']][] = [['今日の予約', today.appointments], ['納車予定', today.deliveries], ['未完了', today.incompleteWork], ['担当作業', today.assignedWork]];
  return <ScrollView contentContainerStyle={tablet ? styles.todayTablet : styles.today}>{groups.map(([title, items]) => <View key={title} style={[styles.card, tablet && styles.cardTablet]}><View style={styles.sectionHeading}><Text style={styles.section}>{title}</Text><Text style={styles.count}>{items.length > 8 && title !== '今日の予約' ? `先頭8件 / 取得${items.length}件` : `${items.length}件表示`}</Text></View>{items.length ? (title === '今日の予約' ? items : items.slice(0, 8)).map((item) => {
    const itemTitle = item.vehicleLabel || item.customerName || item.job_no || item.appointment_type || item.job_type || '予定';
    const itemDetails = [item.customerName && item.customerName !== itemTitle ? item.customerName : null, item.job_no ? `案件 ${item.job_no}` : null, statusLabel(item.status), date(item.scheduled_at || item.scheduled_delivery_at || item.scheduled_in_at)].filter(Boolean).join(' · ');
    const content = <><Text style={styles.todayItemTitle}>{itemTitle}</Text><Text style={styles.todayItemMeta}>{itemDetails}</Text>{item.assigned_user_name && <Text style={styles.todayItemMeta}>担当 {item.assigned_user_name}</Text>}</>;
    return title === '今日の予約' ? <View key={item.id} style={styles.todayItem}>{content}</View> : <TouchableOpacity key={item.id} style={styles.todayItem} onPress={() => onJob(item.id)} accessibilityRole="button" accessibilityLabel={`${itemTitle}の詳細を開く`}>{content}</TouchableOpacity>;
  }) : <Text style={styles.muted}>該当する予定はありません。</Text>}{items.length > 8 && title !== '今日の予約' && <ActionButton title="整備一覧で続きを確認" onPress={onMaintenance} variant="ghost" compact />}</View>)}</ScrollView>;
}

function Search({ placeholder, value, onChange, onSearch, onClear }: { placeholder: string; value: string; onChange: (value: string) => void; onSearch: () => void; onClear: () => void }) { return <View style={styles.search}><View style={styles.searchField}><Ionicons name="search-outline" size={20} color={colors.muted} /><TextInput style={styles.searchInput} placeholder={placeholder} placeholderTextColor={colors.muted} value={value} onChangeText={onChange} onSubmitEditing={onSearch} returnKeyType="search" accessibilityLabel={placeholder} />{value ? <TouchableOpacity onPress={onClear} accessibilityLabel="検索条件を解除" accessibilityRole="button" style={styles.clearSearch}><Ionicons name="close-circle" size={20} color={colors.muted} /></TouchableOpacity> : null}</View><ActionButton title="検索" onPress={onSearch} compact /></View>; }

function EntityRow({ title, subtitle, onPress, right }: { title: string; subtitle: string; onPress: () => void; right?: React.ReactNode }) { return <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button"><View style={styles.rowBody}><Text style={styles.rowTitle} numberOfLines={1}>{title}</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text></View><View style={styles.rowRight}>{right}<Ionicons name="chevron-forward" size={20} color={colors.muted} /></View></TouchableOpacity>; }
function DetailHero({ title, status }: { title: string; status?: string | null }) { return <View style={styles.detailHero}><Text style={styles.detailTitle}>{title}</Text>{status ? <StatusChip value={status} /> : null}</View>; }
function FieldLabel({ label }: { label: string }) { return <Text style={styles.fieldLabel}>{label}</Text>; }
function SectionLabel({ label }: { label: string }) { return <Text style={styles.section}>{label}</Text>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
function StatusChip({ value }: { value: string | null | undefined }) { return <View style={[styles.statusChip, (value === 'completed' || value === '完了') && styles.statusComplete]}><Text style={styles.statusChipText}>{statusLabel(value)}</Text></View>; }
function ErrorNotice({ message }: { message: string }) { return <View style={styles.errorBox}><Text style={styles.error}>{message}</Text></View>; }
function SessionRestoring() { return <SafeAreaView style={styles.center} accessibilityLabel="セッションを復元中"><Image source={require('./assets/garage-link-logo.png')} style={styles.restoreLogo} resizeMode="contain" accessibilityLabel="GARAGE LINK" /><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.muted}>セッションを確認しています。</Text></SafeAreaView>; }
function ListState({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry: () => void; children: React.ReactNode }) {
  if (loading) return <View style={styles.state}><ActivityIndicator color={colors.primary} size="large" /></View>;
  if (error) return <View style={styles.state}><ErrorNotice message={error} /><ActionButton title="再試行" onPress={onRetry} /></View>;
  return <>{children}</>;
}
function PageFooter({ count, more, loading, onMore }: { count: number; more: boolean; loading: boolean; onMore: () => void }) { return count ? <View style={styles.pageFooter}><Text style={styles.muted}>{count}件表示</Text>{more && <ActionButton title="さらに読み込む" onPress={onMore} disabled={loading} variant="secondary" />}</View> : null; }
function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) { return <View style={[styles.empty, compact && styles.emptyCompact]}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{description}</Text></View>; }
function Centered({ message }: { message: string }) { return <SafeAreaView style={styles.center}><Text style={styles.muted}>{message}</Text></SafeAreaView>; }
function ActionButton({ title, onPress, compact = false, variant = 'primary', disabled = false }: { title: string; onPress: () => void; compact?: boolean; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean }) { const busy = useContext(BusyContext); const unavailable = disabled || busy; return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: unavailable }} style={[styles.actionButton, compact && styles.actionButtonCompact, variant === 'secondary' && styles.actionButtonSecondary, variant === 'ghost' && styles.actionButtonGhost, unavailable && styles.actionButtonDisabled]} onPress={onPress} disabled={unavailable}><Text style={[styles.actionButtonText, variant !== 'primary' && styles.actionButtonSecondaryText]}>{title}</Text></TouchableOpacity>; }
function VehicleChoice({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) { const busy = useContext(BusyContext); return <TouchableOpacity style={styles.vehicleChoice} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }} aria-checked={selected} onPress={onPress} disabled={busy}><Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.muted} /><Text style={styles.choiceLabel}>{title}</Text></TouchableOpacity>; }

function SignedImage({ storeId, fileId }: { storeId: string; fileId: string }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${storeId}:${fileId}:${attempt}`;
  const [result, setResult] = useState<{ key: string; url: string | null; failed: boolean } | null>(null);
  const visible = result?.key === key ? result : null;
  const imageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function finishImageLoad() { if (imageTimer.current) clearTimeout(imageTimer.current); imageTimer.current = null; }
  useEffect(() => {
    let active = true;
    void mobileApi.signedUrl(storeId, fileId).then((response) => { if (active) setResult({ key, url: response.signedUrl, failed: !response.signedUrl }); }).catch(() => { if (active) setResult({ key, url: null, failed: true }); });
    return () => { active = false; };
  }, [storeId, fileId, key]);
  useEffect(() => {
    if (visible?.url) imageTimer.current = setTimeout(() => setResult({ key, url: null, failed: true }), 20000);
    return () => { if (imageTimer.current) clearTimeout(imageTimer.current); };
  }, [key, visible?.url]);
  if (visible?.failed) return <View style={styles.imageLoading}><Ionicons name="image-outline" size={28} color={colors.muted} /><Text style={styles.muted}>写真を読み込めませんでした。</Text><ActionButton title="写真を再読み込み" onPress={() => setAttempt((value) => value + 1)} compact variant="secondary" /></View>;
  return visible?.url ? <Image source={{ uri: visible.url }} style={styles.image} onLoad={finishImageLoad} onError={() => { finishImageLoad(); setResult({ key, url: null, failed: true }); }} accessibilityLabel="車両写真" /> : <View style={styles.imageLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>写真を読み込んでいます…</Text></View>;
}

const colors = { ink: '#112D4E', muted: '#64748B', canvas: '#F4F7FB', surface: '#FFFFFF', line: '#DCE4EF', primary: '#0B74DE', primaryDark: '#0759AB', primarySoft: '#EAF4FF', teal: '#008F8A', tealSoft: '#E1F5F3', error: '#B42318', errorSoft: '#FEF3F2' };
const shadow = { shadowColor: '#102A43', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 };
const styles = StyleSheet.create({
  pageFooter: { paddingVertical: 16, gap: 12 },
  storeContext: { paddingHorizontal: 18, paddingBottom: 12, gap: 6, flexDirection: 'row', alignItems: 'center' },
  storeContextText: { flex: 1, fontSize: 12, color: colors.muted },
  statusComplete: { backgroundColor: '#E8F4EB' },
  flex: { flex: 1, minHeight: 0 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingVertical: 6 },
  progressText: { fontSize: 13, color: colors.muted },
  inlineError: { paddingBottom: 8 },
  cardTablet: { flexGrow: 1, flexBasis: 290, width: 'auto' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: colors.muted, fontSize: 13 },
  searchField: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface, paddingLeft: 10 },
  clearSearch: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  vehicleChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.surface },
  choiceLabel: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 21 },

  screen: { flex: 1, backgroundColor: colors.canvas }, content: { flex: 1, minHeight: 0, paddingHorizontal: 16 }, storeContent: { flex: 1, minHeight: 0, paddingHorizontal: 16 }, screenError: { flex: 1, justifyContent: 'center' }, loginScreen: { flex: 1, backgroundColor: colors.canvas }, loginContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28 }, logo: { width: 242, height: 102, alignSelf: 'center', marginBottom: 22 }, loginTitle: { color: colors.ink, fontSize: 25, lineHeight: 33, fontWeight: '700', textAlign: 'center' }, loginLead: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6, marginBottom: 26 }, loginCard: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 20, ...shadow },
  intro: { marginTop: 8, marginBottom: 14 }, eyebrow: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 }, lead: { color: colors.muted, fontSize: 14, lineHeight: 21 }, loader: { marginTop: 44 }, header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }, headerSpacer: { width: 70 }, headerTitle: { flex: 1, color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '700', textAlign: 'center', paddingHorizontal: 6 },
  bottomTabs: { flexDirection: 'row', flexShrink: 0, minHeight: 64, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 4, gap: 4, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line }, navButton: { flex: 1, minWidth: 0, minHeight: 50, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.surface }, navButtonActive: { backgroundColor: colors.primarySoft }, navText: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center' }, navTextActive: { color: colors.primaryDark, fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  list: { paddingBottom: 20 }, row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 9, ...shadow }, rowBody: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' }, rowSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 }, rowRight: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 10, gap: 3 }, chevron: { color: colors.primary, fontSize: 24, lineHeight: 22, fontWeight: '400' },
  fieldLabel: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FBFCFE', color: colors.ink, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 17 }, inputError: { borderColor: colors.error, backgroundColor: colors.errorSoft }, search: { flexDirection: 'row', gap: 8, marginBottom: 12 }, searchInput: { flex: 1, minWidth: 0, minHeight: 48, color: colors.ink, paddingHorizontal: 6, fontSize: 15 },
  actionButton: { ...buttonLayout, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.primary }, actionButtonCompact: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 11 }, actionButtonSecondary: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#BCDDFE' }, actionButtonGhost: { backgroundColor: 'transparent', borderWidth: 0 }, actionButtonDisabled: { opacity: 0.45 }, actionButtonText: { textAlign: 'center', flexShrink: 1, color: colors.surface, fontSize: 15, fontWeight: '700' }, actionButtonSecondaryText: { color: colors.primaryDark, fontSize: 14 },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 10, borderWidth: 1, borderColor: '#FECDCA', paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, marginBottom: 8 }, error: { color: colors.error, fontSize: 13, lineHeight: 19 }, muted: { color: colors.muted, fontSize: 14, lineHeight: 21 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.canvas }, state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }, restoreLogo: { width: 184, height: 72, marginBottom: 28 }, empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 68 }, emptyCompact: { paddingTop: 30, paddingBottom: 14 }, emptyTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  today: { paddingBottom: 22, gap: 12 }, todayTablet: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 22 }, card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.line, width: '100%', ...shadow }, section: { color: colors.ink, fontWeight: '700', fontSize: 16, lineHeight: 22, marginTop: 7, marginBottom: 10 }, todayItem: { paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, todayItemTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' }, todayItemMeta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  detail: { gap: 10, paddingBottom: 24 }, tabletDetail: { maxWidth: 760, alignSelf: 'center', width: '100%', gap: 10, paddingBottom: 24 }, detailHero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 17, ...shadow }, detailTitle: { color: colors.ink, fontSize: 22, lineHeight: 29, fontWeight: '800', marginBottom: 9 }, infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }, infoLabel: { flexShrink: 0, color: colors.muted, fontSize: 13, lineHeight: 20, marginRight: 16 }, infoValue: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'right' }, statusChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.tealSoft }, statusChipText: { color: colors.teal, fontSize: 12, lineHeight: 16, fontWeight: '800' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineRow: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, paddingVertical: 11 }, inlineText: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' }, primaryAction: { marginTop: 10 }, image: { height: 230, width: '100%', borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginTop: 2 }, imageLoading: { minHeight: 160, padding: 16, gap: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  form: { paddingBottom: 32, gap: 10 }, customerSummary: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 14, marginBottom: 18 }, summaryLabel: { color: colors.primaryDark, fontSize: 12, fontWeight: '700', marginBottom: 3 }, summaryValue: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '700' }, securityNote: { backgroundColor: '#F1F8F8', borderRadius: 10, padding: 12, marginTop: -2, marginBottom: 16 }, securityNoteText: { color: '#25615E', fontSize: 13, lineHeight: 19 },
  preview: { backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 10, marginBottom: 24, ...shadow }, tabletPreview: { maxWidth: 720, alignSelf: 'center', width: '100%', backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 28, gap: 12, marginBottom: 24, ...shadow }, previewEyebrow: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, previewTitle: { fontSize: 25, lineHeight: 33, fontWeight: '800', color: colors.ink, marginBottom: 2 }, quoteDivider: { borderTopWidth: 1, borderColor: colors.line, marginVertical: 4 }, quoteItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, quoteItemName: { flex: 1, paddingRight: 12 }, quoteAmount: { color: colors.ink, fontSize: 14, fontWeight: '700', paddingTop: 2 }, total: { fontWeight: '800', color: colors.ink, fontSize: 21, lineHeight: 29, textAlign: 'right', marginTop: 4 }, amount: { color: colors.ink, fontSize: 14, fontWeight: '800' }, stackActions: { gap: 8, marginTop: 8 },
});
