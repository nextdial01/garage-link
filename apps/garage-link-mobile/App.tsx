import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Session } from '@supabase/supabase-js';
import { mobileApi, type Customer, type CustomerDetail, type MaintenanceJob, type Quote, type QuoteDraft, type Store, type Today, type Vehicle, type VehicleDetail } from './src/mobileApi';
import { mobileConfigurationError, supabase } from './src/supabase';

type Page = 'stores' | 'today' | 'vehicles' | 'vehicleDetail' | 'maintenance' | 'maintenanceDetail' | 'customers' | 'customerDetail' | 'quotes' | 'quoteCreate' | 'quotePreview';
const operationKey = () => 'native-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
const yen = (value: number | null | undefined) => typeof value === 'number' ? value.toLocaleString('ja-JP') + '円' : '-';
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const escapeHtml = (value: string | null | undefined) => (value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
const roleLabel = (role: string | null | undefined) => ({ owner: 'オーナー', admin: '管理者', implementer: '担当者', staff: 'スタッフ', viewer: '閲覧のみ' })[role ?? ''] ?? 'スタッフ';
const statusLabel = (status: string | null | undefined) => ({ received: '受付', working: '作業中', completed: '完了', available: '在庫中', maintenance: '整備中' })[status ?? ''] ?? status ?? '-';

function displayError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : '';
  if (/invalid login credentials/i.test(message)) return 'メールアドレスまたはパスワードが正しくありません。';
  if (/network request failed|failed to fetch|通信に失敗/i.test(message)) return '通信に失敗しました。通信状況を確認して、もう一度お試しください。';
  if (/jwt|not authenticated|ログインが必要/i.test(message)) return 'ログインの有効期限が切れました。もう一度ログインしてください。';
  if (/permission|forbidden|unauthorized|access denied/i.test(message)) return 'この操作を行う権限がありません。';
  return '処理に失敗しました。時間をおいて、もう一度お試しください。';
}

export default function App() {
  const { width } = useWindowDimensions();
  const tablet = width >= 720;
  const [session, setSession] = useState<Session | null>(null);
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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteTitle, setQuoteTitle] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(operationKey());
  const [maintenanceIdempotencyKey, setMaintenanceIdempotencyKey] = useState(operationKey());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) void loadStores(); }, [session]);

  async function run<T>(task: () => Promise<T>) {
    setLoading(true); setError(null);
    try { return await task(); } catch (reason) { setError(displayError(reason)); return undefined; } finally { setLoading(false); }
  }
  async function loadStores() {
    const next = await run(() => mobileApi.stores());
    if (next) { setStores(next); if (next.length === 1) await selectStore(next[0]); }
  }
  async function selectStore(next: Store) { setStore(next); await openToday(next); }
  async function openToday(target = store) {
    if (!target) return;
    const next = await run(() => mobileApi.today(target.id));
    if (next) { setToday(next); setPage('today'); }
  }
  async function openVehicles(query = search) {
    if (!store) return;
    const next = await run(() => mobileApi.vehicles(store.id, query));
    if (next) { setVehicles(next); setPage('vehicles'); }
  }
  async function openVehicle(next: Vehicle) {
    if (!store) return;
    const loaded = await run(() => mobileApi.detail(store.id, next.id));
    if (loaded) { setVehicle(loaded); setPage('vehicleDetail'); }
  }
  async function changeVehicleStatus(status: string) {
    if (!store || !vehicle) return;
    const next = await run(() => mobileApi.updateStatus(store.id, vehicle.vehicle.id, status));
    if (next) setVehicle({ ...vehicle, vehicle: next });
  }
  async function addPhoto(camera: boolean) {
    if (!store || !vehicle) return;
    const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError(camera ? 'カメラ権限が許可されていません。' : '写真ライブラリ権限が許可されていません。'); return; }
    const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const uploaded = await run(() => mobileApi.uploadVehicleImage(store.id, vehicle.vehicle.id, result.assets[0]));
    if (uploaded) await openVehicle(vehicle.vehicle);
  }
  async function openMaintenance() {
    if (!store) return;
    const next = await run(() => mobileApi.maintenance(store.id));
    if (next) { setJobs(next); setPage('maintenance'); }
  }
  async function openJob(next: MaintenanceJob) {
    if (!store) return;
    const loaded = await run(() => mobileApi.maintenanceDetail(store.id, next.id));
    if (loaded) { setJob(loaded); setMaintenanceIdempotencyKey(operationKey()); setPage('maintenanceDetail'); }
  }
  async function updateJob(status: string) {
    if (!store || !job) return;
    const next = await run(() => mobileApi.updateMaintenance(store.id, job.id, status, maintenanceIdempotencyKey));
    if (next) { setJob(next); setMaintenanceIdempotencyKey(operationKey()); }
  }
  async function openCustomers(query = search) {
    if (!store) return;
    const next = await run(() => mobileApi.customers(store.id, query));
    if (next) { setCustomers(next); setPage('customers'); }
  }
  async function openCustomer(next: Customer) {
    if (!store) return;
    const loaded = await run(() => mobileApi.customerDetail(store.id, next.id));
    if (loaded) { setCustomer(loaded); setPage('customerDetail'); }
  }
  async function openQuotes() {
    if (!store) return;
    const next = await run(() => mobileApi.quotes(store.id));
    if (next) { setQuotes(next); setPage('quotes'); }
  }
  function startQuote() { setQuoteTitle(''); setItemName(''); setItemPrice(''); setIdempotencyKey(operationKey()); setPage('quoteCreate'); }
  async function saveQuote() {
    if (!store || !customer) { setError('見積を作成する顧客を選択してください。'); return; }
    const unitPrice = Number(itemPrice);
    if (!itemName.trim() || !Number.isSafeInteger(unitPrice) || unitPrice <= 0) { setError('明細名と正しい販売価格を入力してください。'); return; }
    const draft: QuoteDraft = { title: quoteTitle.trim() || undefined, customerId: customer.customer.id, vehicleId: customer.vehicles[0]?.id, issueDate: new Date().toISOString().slice(0, 10), items: [{ itemType: 'service', name: itemName.trim(), quantity: 1, unitPrice, taxRate: 0.1 }] };
    const saved = await run(() => mobileApi.createQuote(store.id, idempotencyKey, draft));
    if (saved) { setQuote(saved); setPage('quotePreview'); }
  }
  async function openQuote(next: Quote) {
    if (!store) return;
    const loaded = await run(() => mobileApi.quoteDetail(store.id, next.id));
    if (loaded) { setQuote(loaded); setPage('quotePreview'); }
  }
  const quoteHtml = useMemo(() => {
    if (!quote) return '';
    const items = quote.items.map((item) => '<p>' + escapeHtml(item.name) + '　' + item.quantity + ' × ' + yen(item.unitPrice) + '　= ' + yen(item.amount) + '</p>').join('');
    return '<html><body style="font-family:-apple-system,Arial;padding:28px;color:#102A43"><h1>御見積書</h1><p>見積番号: ' + escapeHtml(quote.quoteNo) + '</p><p>宛先: ' + escapeHtml(quote.customerName) + ' ' + escapeHtml(quote.customerHonorific || '様') + '</p><p>車両: ' + escapeHtml(quote.vehicleLabel) + '</p><hr/>' + items + '<hr/><h2>合計: ' + yen(quote.totalAmount) + '</h2><p>発行日: ' + escapeHtml(quote.issueDate) + '</p></body></html>';
  }, [quote]);
  async function exportPdf(share: boolean) {
    if (!quote) return;
    const result = await run(() => Print.printToFileAsync({ html: quoteHtml }));
    if (result && share) {
      const available = await Sharing.isAvailableAsync();
      if (!available) { setError('この端末では共有機能を利用できません。'); return; }
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: '見積書を共有' });
    }
  }
  async function printQuote() { if (quote) await run(() => Print.printAsync({ html: quoteHtml })); }
  const nav = <Nav active={page} onToday={() => void openToday()} onVehicles={() => void openVehicles()} onMaintenance={() => void openMaintenance()} onCustomers={() => void openCustomers()} onQuotes={() => void openQuotes()} />;

  if (mobileConfigurationError) return <Centered message={mobileConfigurationError} />;
  if (!session) return <Login email={email} password={password} error={error} loading={loading} onEmail={setEmail} onPassword={setPassword} onLogin={() => void run(async () => { const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (authError) throw authError; })} />;
  if (page === 'stores') return <SafeAreaView style={styles.screen}><Header title="店舗を選択" onLogout={() => void supabase.auth.signOut()} /><View style={styles.intro}><Text style={styles.eyebrow}>STORE</Text><Text style={styles.lead}>利用する店舗を選択してください。</Text></View>{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : <FlatList data={stores} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <EntityRow title={item.name} subtitle={roleLabel(item.role)} onPress={() => void selectStore(item)} />} ListEmptyComponent={<EmptyState title="利用可能な店舗がありません" description="管理者へアクセス権をご確認ください。" />} />}{error && <ErrorNotice message={error} />}</SafeAreaView>;
  if (page === 'today') return <Screen title={store?.name || 'GARAGE LINK'} onStore={() => setPage('stores')} onLogout={() => void supabase.auth.signOut()} nav={nav} error={error}><TodayScreen today={today} onMaintenance={() => void openMaintenance()} tablet={tablet} /></Screen>;
  if (page === 'vehicleDetail' && vehicle && store) return <Screen title="車両詳細" onBack={() => void openVehicles()} nav={nav} error={error}><ScrollView contentContainerStyle={tablet ? styles.tabletDetail : styles.detail}><DetailHero title={[vehicle.vehicle.maker, vehicle.vehicle.modelName].filter(Boolean).join(' ') || '車両'} status={vehicle.vehicle.status} /><InfoRow label="管理番号" value={vehicle.vehicle.managementNo || '-'} /><SectionLabel label="状態を更新" /><View style={styles.actions}><ActionButton title="在庫中" onPress={() => void changeVehicleStatus('在庫中')} variant="secondary" /><ActionButton title="整備中" onPress={() => void changeVehicleStatus('整備中')} variant="secondary" /></View><SectionLabel label="写真" /><View style={styles.actions}><ActionButton title="カメラで追加" onPress={() => void addPhoto(true)} /><ActionButton title="写真から追加" onPress={() => void addPhoto(false)} variant="secondary" /></View>{vehicle.imageFiles.map((item) => <SignedImage key={item.id} storeId={store.id} fileId={item.id} />)}{!vehicle.imageFiles.length && <EmptyState title="画像はまだありません" description="カメラまたは写真ライブラリから追加できます。" compact />}</ScrollView></Screen>;
  if (page === 'vehicles') return <Screen title={store?.name || '車両'} onStore={() => setPage('stores')} nav={nav} error={error}><Search placeholder="車名・管理番号で検索" value={search} onChange={setSearch} onSearch={() => void openVehicles()} /><FlatList data={vehicles} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openVehicles()} renderItem={({ item }) => <EntityRow title={[item.maker, item.modelName].filter(Boolean).join(' ') || item.managementNo || '名称未設定'} subtitle={item.managementNo || '管理番号未設定'} right={<StatusChip value={item.status} />} onPress={() => void openVehicle(item)} />} ListEmptyComponent={<EmptyState title="車両がありません" description="検索条件を変えるか、Web版で車両を登録してください。" />} /></Screen>;
  if (page === 'maintenanceDetail' && job) return <Screen title="整備詳細" onBack={() => void openMaintenance()} nav={nav} error={error}><ScrollView contentContainerStyle={styles.detail}><DetailHero title={job.job_no || '整備案件'} status={job.status} /><InfoRow label="種別" value={job.job_type || '-'} /><InfoRow label="納車予定" value={date(job.scheduled_delivery_at)} /><InfoRow label="担当" value={job.assigned_user_name || '-'} /><SectionLabel label="状態を更新" /><View style={styles.statusActions}><ActionButton title="受付" onPress={() => void updateJob('received')} variant="secondary" /><ActionButton title="作業中" onPress={() => void updateJob('working')} variant="secondary" /><ActionButton title="完了" onPress={() => void updateJob('completed')} /></View></ScrollView></Screen>;
  if (page === 'maintenance') return <Screen title="整備・車検" onStore={() => setPage('stores')} nav={nav} error={error}><FlatList data={jobs} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openMaintenance()} renderItem={({ item }) => <EntityRow title={item.job_no || '整備案件'} subtitle={(item.job_type || '種別未設定') + ' · 納車予定 ' + date(item.scheduled_delivery_at)} right={<StatusChip value={item.status} />} onPress={() => void openJob(item)} />} ListEmptyComponent={<EmptyState title="整備案件がありません" description="今日の作業予定はここに表示されます。" />} /></Screen>;
  if (page === 'customerDetail' && customer) return <Screen title="顧客詳細" onBack={() => void openCustomers()} nav={nav} error={error}><ScrollView contentContainerStyle={tablet ? styles.tabletDetail : styles.detail}><DetailHero title={customer.customer.name || '顧客'} /><InfoRow label="電話番号" value={customer.customer.phone || customer.customer.mobile_phone || '-'} /><InfoRow label="メール" value={customer.customer.email || '-'} /><InfoRow label="住所" value={customer.customer.address || '-'} /><SectionLabel label="紐づく車両" />{customer.vehicles.length ? customer.vehicles.map((item) => <InlineRow key={item.id} text={[item.managementNo, item.maker, item.modelName].filter(Boolean).join(' / ')} />) : <Text style={styles.muted}>登録車両はありません。</Text>}<SectionLabel label="整備案件" />{customer.maintenance.length ? customer.maintenance.map((item) => <InlineRow key={item.id} text={(item.job_no || '-') + ' · ' + statusLabel(item.status)} />) : <Text style={styles.muted}>整備案件はありません。</Text>}<View style={styles.primaryAction}><ActionButton title="この顧客の見積を作成" onPress={startQuote} /></View></ScrollView></Screen>;
  if (page === 'customers') return <Screen title="顧客" onStore={() => setPage('stores')} nav={nav} error={error}><Search placeholder="顧客名・電話番号で検索" value={search} onChange={setSearch} onSearch={() => void openCustomers()} /><FlatList data={customers} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openCustomers()} renderItem={({ item }) => <EntityRow title={item.name || '名称未設定'} subtitle={item.phone || item.mobile_phone || '電話番号未設定'} onPress={() => void openCustomer(item)} />} ListEmptyComponent={<EmptyState title="顧客がありません" description="検索条件を変えてお試しください。" />} /></Screen>;
  if (page === 'quoteCreate') return <Screen title="見積を作成" onBack={() => setPage('customerDetail')} nav={nav} error={error}><ScrollView contentContainerStyle={styles.form}><View style={styles.customerSummary}><Text style={styles.summaryLabel}>宛先</Text><Text style={styles.summaryValue}>{customer?.customer.name || '-'}</Text></View><FieldLabel label="見積タイトル（任意）" /><TextInput style={styles.input} placeholder="例：車検整備のお見積" placeholderTextColor={colors.muted} value={quoteTitle} onChangeText={setQuoteTitle} /><FieldLabel label="販売明細名" /><TextInput style={styles.input} placeholder="例：車検整備一式" placeholderTextColor={colors.muted} value={itemName} onChangeText={setItemName} /><FieldLabel label="販売価格（税抜・円）" /><TextInput style={styles.input} placeholder="例：50000" placeholderTextColor={colors.muted} keyboardType="numeric" value={itemPrice} onChangeText={setItemPrice} /><View style={styles.securityNote}><Text style={styles.securityNoteText}>原価・利益・内部メモはこのアプリに表示・送信されません。</Text></View><ActionButton title="保存してプレビュー" onPress={() => void saveQuote()} /></ScrollView></Screen>;
  if (page === 'quotePreview' && quote) return <Screen title="お客様向けプレビュー" onBack={() => void openQuotes()} nav={nav} error={error}><ScrollView contentContainerStyle={tablet ? styles.tabletPreview : styles.preview}><Text style={styles.previewEyebrow}>ESTIMATE</Text><Text style={styles.previewTitle}>御見積書</Text><InfoRow label="見積番号" value={quote.quoteNo || '-'} /><InfoRow label="宛先" value={(quote.customerName || '-') + ' ' + (quote.customerHonorific || '様')} /><InfoRow label="車両" value={quote.vehicleLabel || '-'} /><View style={styles.quoteDivider} />{quote.items.map((item) => <View key={item.id || item.name} style={styles.quoteItem}><View style={styles.quoteItemName}><Text style={styles.inlineText}>{item.name}</Text><Text style={styles.muted}>{item.quantity} × {yen(item.unitPrice)}</Text></View><Text style={styles.quoteAmount}>{yen(item.amount)}</Text></View>)}<Text style={styles.total}>合計 {yen(quote.totalAmount)}</Text><View style={styles.stackActions}><ActionButton title="PDFを作成" onPress={() => void exportPdf(false)} /><ActionButton title="共有" onPress={() => void exportPdf(true)} variant="secondary" /><ActionButton title="印刷" onPress={() => void printQuote()} variant="ghost" /></View></ScrollView></Screen>;
  return <Screen title="見積" onStore={() => setPage('stores')} nav={nav} error={error}><FlatList data={quotes} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshing={loading} onRefresh={() => void openQuotes()} renderItem={({ item }) => <EntityRow title={item.quoteNo || '見積'} subtitle={item.customerName || '宛先未設定'} right={<Text style={styles.amount}>{yen(item.totalAmount)}</Text>} onPress={() => void openQuote(item)} />} ListEmptyComponent={<EmptyState title="見積がありません" description="顧客詳細画面から新しい見積を作成できます。" />} /></Screen>;
}

function Login({ email, password, error, loading, onEmail, onPassword, onLogin }: { email: string; password: string; error: string | null; loading: boolean; onEmail: (value: string) => void; onPassword: (value: string) => void; onLogin: () => void }) {
  return <SafeAreaView style={styles.loginScreen}><View style={styles.loginContent}><Image source={require('./assets/icon.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="GARAGE LINK" /><Text style={styles.loginTitle}>ログイン</Text><Text style={styles.loginLead}>アカウント情報を入力してください</Text><View style={styles.loginCard}><FieldLabel label="メールアドレス" /><TextInput style={styles.input} placeholder="name@example.com" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email" value={email} onChangeText={onEmail} /><FieldLabel label="パスワード" /><TextInput style={styles.input} placeholder="パスワードを入力" placeholderTextColor={colors.muted} secureTextEntry textContentType="password" autoComplete="current-password" value={password} onChangeText={onPassword} /><ActionButton title="ログイン" onPress={onLogin} disabled={!email || !password || loading} />{error && <ErrorNotice message={error} />}</View></View></SafeAreaView>;
}
function Screen({ title, onBack, onStore, onLogout, nav, error, children }: { title: string; onBack?: () => void; onStore?: () => void; onLogout?: () => void; nav: React.ReactNode; error: string | null; children: React.ReactNode }) { return <SafeAreaView style={styles.screen}><Header title={title} onBack={onBack || onStore} backTitle={onBack ? '戻る' : '店舗'} onLogout={onLogout} />{nav}<View style={styles.content}>{children}</View>{error && <ErrorNotice message={error} />}</SafeAreaView>; }
function Header({ title, onBack, backTitle = '戻る', onLogout }: { title: string; onBack?: () => void; backTitle?: string; onLogout?: () => void }) { return <View style={styles.header}>{onBack ? <ActionButton title={backTitle} onPress={onBack} compact variant="ghost" /> : <View style={styles.headerSpacer} />}<Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>{onLogout ? <ActionButton title="ログアウト" onPress={onLogout} compact variant="ghost" /> : <View style={styles.headerSpacer} />}</View>; }
function Nav({ active, onToday, onVehicles, onMaintenance, onCustomers, onQuotes }: { active: Page; onToday: () => void; onVehicles: () => void; onMaintenance: () => void; onCustomers: () => void; onQuotes: () => void }) {
  const items: Array<{ key: Page; label: string; onPress: () => void }> = [{ key: 'today', label: '今日', onPress: onToday }, { key: 'vehicles', label: '車両', onPress: onVehicles }, { key: 'maintenance', label: '整備', onPress: onMaintenance }, { key: 'customers', label: '顧客', onPress: onCustomers }, { key: 'quotes', label: '見積', onPress: onQuotes }];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>{items.map((item) => <TouchableOpacity key={item.key} style={[styles.navButton, active === item.key && styles.navButtonActive]} onPress={item.onPress} accessibilityRole="tab" accessibilityState={{ selected: active === item.key }}><Text style={active === item.key ? styles.navTextActive : styles.navText}>{item.label}</Text></TouchableOpacity>)}</ScrollView>;
}
function TodayScreen({ today, onMaintenance, tablet }: { today: Today | null; onMaintenance: () => void; tablet: boolean }) {
  if (!today) return <Centered message="今日の予定を読み込んでいます。" />;
  const groups: Array<[string, Today['appointments']]> = [['今日の予約', today.appointments], ['納車予定', today.deliveries], ['未完了', today.incompleteWork], ['担当作業', today.assignedWork]];
  return <ScrollView contentContainerStyle={tablet ? styles.todayTablet : styles.today}>{groups.map(([title, items]) => <View key={title} style={styles.card}><Text style={styles.section}>{title}</Text>{items.length ? items.slice(0, 8).map((item) => <TouchableOpacity key={item.id} style={styles.todayItem} onPress={onMaintenance}><Text style={styles.todayItemTitle}>{item.job_no || item.appointment_type || item.job_type || '予定'}</Text><Text style={styles.todayItemMeta}>{statusLabel(item.status)} · {date(item.scheduled_at || item.scheduled_delivery_at || item.scheduled_in_at)}</Text></TouchableOpacity>) : <Text style={styles.muted}>該当する予定はありません。</Text>}</View>)}</ScrollView>;
}
function Search({ placeholder, value, onChange, onSearch }: { placeholder: string; value: string; onChange: (value: string) => void; onSearch: () => void }) { return <View style={styles.search}><TextInput style={styles.searchInput} placeholder={placeholder} placeholderTextColor={colors.muted} value={value} onChangeText={onChange} onSubmitEditing={onSearch} accessibilityLabel={placeholder} /><ActionButton title="検索" onPress={onSearch} compact /></View>; }
function EntityRow({ title, subtitle, onPress, right }: { title: string; subtitle: string; onPress: () => void; right?: React.ReactNode }) { return <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button"><View style={styles.rowBody}><Text style={styles.rowTitle} numberOfLines={1}>{title}</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text></View><View style={styles.rowRight}>{right}<Text style={styles.chevron}>›</Text></View></TouchableOpacity>; }
function DetailHero({ title, status }: { title: string; status?: string | null }) { return <View style={styles.detailHero}><Text style={styles.detailTitle}>{title}</Text>{status ? <StatusChip value={status} /> : null}</View>; }
function FieldLabel({ label }: { label: string }) { return <Text style={styles.fieldLabel}>{label}</Text>; }
function SectionLabel({ label }: { label: string }) { return <Text style={styles.section}>{label}</Text>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>; }
function InlineRow({ text }: { text: string }) { return <View style={styles.inlineRow}><Text style={styles.inlineText}>{text}</Text></View>; }
function StatusChip({ value }: { value: string | null | undefined }) { return <View style={styles.statusChip}><Text style={styles.statusChipText}>{statusLabel(value)}</Text></View>; }
function ErrorNotice({ message }: { message: string }) { return <View style={styles.errorBox}><Text style={styles.error}>{message}</Text></View>; }
function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) { return <View style={[styles.empty, compact && styles.emptyCompact]}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{description}</Text></View>; }
function Centered({ message }: { message: string }) { return <SafeAreaView style={styles.center}><Text style={styles.muted}>{message}</Text></SafeAreaView>; }
function ActionButton({ title, onPress, compact = false, variant = 'primary', disabled = false }: { title: string; onPress: () => void; compact?: boolean; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean }) { return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} style={[styles.actionButton, compact && styles.actionButtonCompact, variant === 'secondary' && styles.actionButtonSecondary, variant === 'ghost' && styles.actionButtonGhost, disabled && styles.actionButtonDisabled]} onPress={onPress} disabled={disabled}><Text style={[styles.actionButtonText, variant !== 'primary' && styles.actionButtonSecondaryText]}>{title}</Text></TouchableOpacity>; }
function SignedImage({ storeId, fileId }: { storeId: string; fileId: string }) { const [url, setUrl] = useState<string | null>(null); useEffect(() => { void mobileApi.signedUrl(storeId, fileId).then((result) => setUrl(result.signedUrl)).catch(() => setUrl(null)); }, [storeId, fileId]); return url ? <Image source={{ uri: url }} style={styles.image} /> : <View style={styles.imageLoading}><ActivityIndicator color={colors.primary} /></View>; }

const colors = { ink: '#112D4E', muted: '#64748B', canvas: '#F4F7FB', surface: '#FFFFFF', line: '#DCE4EF', primary: '#0B74DE', primaryDark: '#0759AB', primarySoft: '#EAF4FF', teal: '#008F8A', tealSoft: '#E1F5F3', error: '#B42318', errorSoft: '#FEF3F2' };
const shadow = { shadowColor: '#102A43', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 };
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 16 }, content: { flex: 1, minHeight: 0 }, loginScreen: { flex: 1, backgroundColor: colors.canvas }, loginContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28 }, logo: { width: 92, height: 92, alignSelf: 'center', marginBottom: 22 }, loginTitle: { color: colors.ink, fontSize: 25, lineHeight: 33, fontWeight: '700', textAlign: 'center' }, loginLead: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6, marginBottom: 26 }, loginCard: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 20, ...shadow },
  intro: { marginTop: 8, marginBottom: 14 }, eyebrow: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 }, lead: { color: colors.muted, fontSize: 14, lineHeight: 21 }, loader: { marginTop: 44 }, header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerSpacer: { width: 70 }, headerTitle: { flex: 1, color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '700', textAlign: 'center', paddingHorizontal: 6 },
  nav: { gap: 7, paddingTop: 2, paddingBottom: 13 }, navButton: { minWidth: 59, minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, navButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary }, navText: { color: colors.muted, fontSize: 13, fontWeight: '700' }, navTextActive: { color: colors.surface, fontSize: 13, fontWeight: '700' },
  list: { paddingBottom: 20 }, row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 9, ...shadow }, rowBody: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' }, rowSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 }, rowRight: { alignItems: 'flex-end', justifyContent: 'center', marginLeft: 10, gap: 3 }, chevron: { color: colors.primary, fontSize: 24, lineHeight: 22, fontWeight: '400' },
  fieldLabel: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FBFCFE', color: colors.ink, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 17 }, search: { flexDirection: 'row', gap: 8, marginBottom: 12 }, searchInput: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink, borderRadius: 10, paddingHorizontal: 14, fontSize: 15 },
  actionButton: { flexGrow: 1, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.primary }, actionButtonCompact: { flexGrow: 0, minHeight: 36, paddingHorizontal: 11 }, actionButtonSecondary: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: '#BCDDFE' }, actionButtonGhost: { backgroundColor: 'transparent', borderWidth: 0 }, actionButtonDisabled: { opacity: 0.45 }, actionButtonText: { color: colors.surface, fontSize: 15, fontWeight: '700' }, actionButtonSecondaryText: { color: colors.primaryDark, fontSize: 14 },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 10, borderWidth: 1, borderColor: '#FECDCA', paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, marginBottom: 8 }, error: { color: colors.error, fontSize: 13, lineHeight: 19 }, muted: { color: colors.muted, fontSize: 14, lineHeight: 21 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.canvas }, empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 68 }, emptyCompact: { paddingTop: 30, paddingBottom: 14 }, emptyTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6 },
  today: { paddingBottom: 22, gap: 12 }, todayTablet: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 22 }, card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.line, minWidth: 270, flexGrow: 1, flexBasis: 290, ...shadow }, section: { color: colors.ink, fontWeight: '700', fontSize: 16, lineHeight: 22, marginTop: 7, marginBottom: 10 }, todayItem: { paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, todayItemTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' }, todayItemMeta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  detail: { gap: 10, paddingBottom: 24 }, tabletDetail: { maxWidth: 760, alignSelf: 'center', width: '100%', gap: 10, paddingBottom: 24 }, detailHero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 17, ...shadow }, detailTitle: { color: colors.ink, fontSize: 22, lineHeight: 29, fontWeight: '800', marginBottom: 9 }, infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }, infoLabel: { flexShrink: 0, color: colors.muted, fontSize: 13, lineHeight: 20, marginRight: 16 }, infoValue: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'right' }, statusChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.tealSoft }, statusChipText: { color: colors.teal, fontSize: 12, lineHeight: 16, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 8 }, statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineRow: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13, paddingVertical: 11 }, inlineText: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' }, primaryAction: { marginTop: 10 }, image: { height: 230, width: '100%', borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginTop: 2 }, imageLoading: { height: 160, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  form: { paddingBottom: 24 }, customerSummary: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: 14, marginBottom: 18 }, summaryLabel: { color: colors.primaryDark, fontSize: 12, fontWeight: '700', marginBottom: 3 }, summaryValue: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '700' }, securityNote: { backgroundColor: '#F1F8F8', borderRadius: 10, padding: 12, marginTop: -2, marginBottom: 16 }, securityNoteText: { color: '#25615E', fontSize: 13, lineHeight: 19 },
  preview: { backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 10, marginBottom: 24, ...shadow }, tabletPreview: { maxWidth: 720, alignSelf: 'center', width: '100%', backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 28, gap: 12, marginBottom: 24, ...shadow }, previewEyebrow: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, previewTitle: { fontSize: 25, lineHeight: 33, fontWeight: '800', color: colors.ink, marginBottom: 2 }, quoteDivider: { borderTopWidth: 1, borderColor: colors.line, marginVertical: 4 }, quoteItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, quoteItemName: { flex: 1, paddingRight: 12 }, quoteAmount: { color: colors.ink, fontSize: 14, fontWeight: '700', paddingTop: 2 }, total: { fontWeight: '800', color: colors.ink, fontSize: 21, lineHeight: 29, textAlign: 'right', marginTop: 4 }, amount: { color: colors.ink, fontSize: 14, fontWeight: '800' }, stackActions: { gap: 8, marginTop: 8 },
});
