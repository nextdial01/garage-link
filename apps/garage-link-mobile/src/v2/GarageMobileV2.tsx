import { documentHtml, quoteHtml } from './documentHtml';
import { quoteCopyDraft, maintenanceQuoteDraft, vehicleQuoteDraft } from './documentDraft';
import { storedPriceToDisplay, displayPriceToStored } from '../../../garage-link/src/lib/business/money';
import { legacyWorkDetails } from '../../../garage-link/src/lib/business/workDetails';
import { useEffect, useEffectEvent, useState, useRef } from 'react';
import { Platform, BackHandler, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { mobileApi, type Store, type V2Record, type V2Resource, type Quote } from '../mobileApi';
import { Button, Card, Field, Info, Row, Shell, type Tab } from './Ui';
import { TabContent, DetailContent, FormContent, PhotoContent, QuoteContent, InvoiceContent, PaymentContent, formPayload, parseQuoteItems } from './Content';

type Entity = 'vehicles' | V2Resource;
type Route = { kind: 'tab'; tab: Tab } | { kind: 'detail'; tab: Tab; entity: Entity; id: string } | { kind: 'form'; tab: Tab; entity: Entity; id?: string } | { kind: 'photo'; tab: Tab; relatedType: 'vehicle' | 'maintenance_job' | 'trade_in_vehicle'; id: string } | { kind: 'quote'; invoiceSourceId?: string; tab: Tab; dealId?: string; jobId?: string; customerId: string; vehicleId?: string } | { kind: 'quoteDetail'; tab: Tab; id: string } | { kind: 'invoice'; tab: Tab; quoteId: string } | { kind: 'invoiceDetail'; tab: Tab; id: string } | { kind: 'payment'; tab: Tab; invoiceId: string } | { kind: 'sale'; tab: Tab; dealId: string } | { kind: 'delivery'; tab: Tab; dealId: string } | { kind:'cancel';tab:Tab;dealId:string };
type InventoryRow = Record<string, unknown> & { id: string };
const str = (row: Record<string, unknown> | null | undefined, key: string) => typeof row?.[key] === 'string' ? row[key] as string : '';
const num = (row: Record<string, unknown> | null | undefined, key: string) => typeof row?.[key] === 'number' ? row[key] as number : 0;
const yen = (amount: number) => `${amount.toLocaleString('ja-JP')}円`;
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const clientId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (letter) => { const random = Math.floor(Math.random() * 16); return (letter === 'x' ? random : random & 3 | 8).toString(16); });
const operationKey = () => `mobile-v2-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const editable: Record<Entity,string[]> = {
  vehicles:['inspection_expiry_date','liability_insurance_expiry_date','vin','maker','model_name','management_no','purchase_supplier_name','purchase_supplier_type','purchase_date','purchase_price','market_value','listing_price','direct_cost_special','direct_cost_accessories','direct_cost_agency','direct_cost_legal','direct_cost_other','direct_cost_repair'],
  customers:['birth_date','postal_code','name','phone','email','address','customer_type','desired_maker','desired_model','budget_max','desired_purchase_timing','trade_in_status','customer_status','assigned_user_name','next_action_date','memo'],
  deals:['customer_id','vehicle_id','title','status','probability','source','budget','trade_in_status','loan_request','next_action_at','assigned_user_name','memo'],
  maintenance:['customer_id','vehicle_id','job_type','priority','request_detail','symptoms','assigned_user_name','scheduled_in_at','work_details','tax_display_mode','work_instruction','scheduled_start_date','scheduled_finish_date','scheduled_delivery_at','actual_in_date','actual_finish_date','actual_delivery_date','planned_parts','loaner_status','labor_amount','parts_amount','inspection_amount','legal_fee_amount','additional_amount','discount_amount','payment_method','estimate_confirm_status','work_memo','customer_message'],
  appointments:['appointment_type','scheduled_at','customer_id','vehicle_id','deal_id','assigned_user_name','note','status'],
  tradeIns:['deal_id','customer_id','maker','model_name','grade','model_year','mileage_km','vin','registration_no','inspection_expiry_date','color','condition_status','appraisal_amount','loan_balance','trade_in_amount','memo'],
};
const vehicleTaxablePrices = ['purchasePrice','direct_cost_special','direct_cost_accessories','direct_cost_agency','direct_cost_other','direct_cost_repair'];
function editDraft(entity: Entity, row: V2Record, mode: 'included'|'excluded') {
  const draft: Record<string,string> = {};
  for (const key of editable[entity]) {
    const value = row[key];
    if (value != null) draft[key] = Array.isArray(value) ? JSON.stringify(value) : String(value);
  }
  if (entity === 'deals' && draft.status === 'new') draft.status = '新規';
  if (entity === 'maintenance') draft._maintenanceParts = JSON.stringify(row.maintenance_parts || []);
  if (entity === 'maintenance') draft.tax_display_mode = String(row.tax_display_mode || 'included');
  if (entity === 'maintenance' && Number(row.work_details_version) !== 1) draft.work_details = JSON.stringify(legacyWorkDetails(Array.isArray(row.work_items) ? row.work_items as string[] : [], Number(row.labor_amount || 0)));
  if (entity === 'vehicles') {
    for (const [from,to] of [['inspection_expiry_date','inspectionExpiryDate'],['liability_insurance_expiry_date','liabilityInsuranceExpiryDate'],['model_name','modelName'],['management_no','managementNo'],['purchase_supplier_name','supplierName'],['purchase_supplier_type','supplierType'],['purchase_date','purchaseDate'],['purchase_price','purchasePrice'],['market_value','marketValue'],['listing_price','listingPrice']]) {
      if (draft[from] != null) { draft[to] = draft[from]; delete draft[from]; }
    }
  }
  if (entity === 'vehicles') draft._vehiclePrices = JSON.stringify(Object.fromEntries(vehicleTaxablePrices.map(key=>[key,row[key === 'purchasePrice' ? 'purchase_price' : key]])));
  if (entity === 'vehicles') for (const key of vehicleTaxablePrices) if (draft[key] != null) draft[key] = String(storedPriceToDisplay(Number(draft[key]),mode));
  return draft;
}

export default function GarageMobileV2({ store, onLogout, onStore }: { store: Store; onLogout: () => void; onStore: () => void }) {
  const [businessMode,setBusinessMode] = useState<'included'|'excluded'>('included');
  const [businessReady,setBusinessReady] = useState(false);
  const [businessError,setBusinessError] = useState('');
  useEffect(() => { let active = true; mobileApi.businessSettings(store.id).then((result) => { if(active) { setBusinessMode(result.taxDisplayMode); setBusinessReady(true); } }).catch(() => { if(active) setBusinessError('店舗設定を取得できませんでした。店舗を選び直してください。'); }); return () => { active=false; }; },[store.id]);
  const [route, setRoute] = useState<Route>({ kind: 'tab', tab: 'today' });
  const [stack, setStack] = useState<Route[]>([]);
  const [rows, setRows] = useState<Partial<Record<Entity, V2Record[]>>>({});
  const [nextOffsets, setNextOffsets] = useState<Partial<Record<Entity,number|null>>>({});
  const [today, setToday] = useState<Record<string, unknown> | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [current, setCurrent] = useState<V2Record | InventoryRow | null>(null);
  const [photos, setPhotos] = useState<{ id: string; photo_category: string | null }[]>([]);
  const [relatedQuotes, setRelatedQuotes] = useState<Quote[]>([]);
  const [relatedInvoices, setRelatedInvoices] = useState<V2Record[]>([]);
  const [relatedTradeIns, setRelatedTradeIns] = useState<V2Record[]>([]);
  const [relatedAppointments, setRelatedAppointments] = useState<V2Record[]>([]);
  const [customerVehicles, setCustomerVehicles] = useState<{id:string;maker:string|null;modelName:string|null}[]>([]);
  const [customerMaintenance, setCustomerMaintenance] = useState<{id:string;job_no:string|null}[]>([]);
  const [customerDeals, setCustomerDeals] = useState<{id:string;title:string|null}[]>([]);
  const [quoteView, setQuoteView] = useState<Quote | null>(null);
  const [invoiceView, setInvoiceView] = useState<V2Record | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<Record<string,unknown>[]>([]);
  const [detailTab, setDetailTab] = useState('基本');
  const [draft, setDraft] = useState<Record<string, string>>({ purchaseDate: day() });
  const [formId, setFormId] = useState(clientId());
  const [operationId, setOperationId] = useState(operationKey());
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState<Record<Tab, string>>({ today: '', vehicles: '', deals: '', maintenance: '', customers: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const pendingDone = useRef<Promise<void>>(Promise.resolve());
  const canWrite = store.role !== 'viewer';
  const canFinance = store.role === 'owner' || store.role === 'admin' || store.role === 'staff';
  const value = (key: string) => draft[key] ?? '';
  const set = (key: string, value: string) => { setDraft((current) => ({ ...current, [key]: value })); setError(''); };
  const push = (next: Route) => { setStack((previous) => [...previous, route]); setRoute(next); setError(''); setCurrent(null); };
  const back = () => {
    const previous = stack.at(-1) ?? { kind: 'tab', tab: route.tab } as Route;
    setCurrent(null); setQuoteView(null); setInvoiceView(null); setRoute(previous); setStack((items) => items.slice(0,-1)); setError('');
    if (previous.kind === 'detail') void readDetail(previous.entity,previous.id);
    if (previous.kind === 'quoteDetail') void run(async () => setQuoteView(await mobileApi.quoteDetail(store.id,previous.id)),true);
    if (previous.kind === 'invoiceDetail') void run(async () => { const value = await mobileApi.v2InvoiceDetail(store.id,previous.id); setInvoiceView(value.invoice); setInvoiceItems(value.items); },true);
  };
  const tab = (next: Tab) => { setRoute({ kind: 'tab', tab: next }); setStack([]); setError(''); };
  const startForm = (entity: Entity, tab: Tab, preset: Record<string, string> = {}, id?: string) => {
    setDraft(preset); setStep(1); setFormId(id ?? clientId()); push({ kind: 'form', tab, entity, id });
    if (entity === 'deals' || entity === 'maintenance' || entity === 'appointments') {
      void Promise.all([load('customers'), load('vehicles'), ...(entity === 'appointments' ? [load('deals')] : [])]).catch((reason) => setError(failMessage(reason)));
    }
  };
  const failMessage = (reason: unknown) => reason instanceof Error ? reason.message : '通信を完了できませんでした。保存状態を確認して再試行してください。';
  async function run<T>(task: () => Promise<T>, waitForPending = false): Promise<T | null> {
    if (pending.current && !waitForPending) return null;
    while (pending.current) await pendingDone.current;
    let complete!: () => void;
    pendingDone.current = new Promise<void>((resolve) => { complete = resolve; });
    pending.current = true; setBusy(true); setError('');
    try { return await task(); }
    catch (reason) { setError(failMessage(reason)); return null; }
    finally { pending.current = false; setBusy(false); complete(); }
  }
  async function load(entity: Entity, q = '') {
    if (entity === 'vehicles') {
      if (canFinance) {
        const result = await mobileApi.v2Inventory(store.id,0,q);
        setRows((old) => ({ ...old, vehicles: result.vehicles as V2Record[] })); setMetrics(result.metrics); setNextOffsets((old) => ({...old,vehicles:result.nextOffset}));
      } else {
        const result = await mobileApi.vehiclesPage(store.id,q);
        setRows((old) => ({...old,vehicles:result.vehicles.map((item) => ({...item,id:item.id,model_name:item.modelName,management_no:item.managementNo}))})); setNextOffsets((old) => ({...old,vehicles:result.nextOffset}));
      }
    } else {
      const result = await mobileApi.v2List(store.id, entity, q ? {q} : {});
      setRows((old) => ({ ...old, [entity]: result.rows })); setNextOffsets((old) => ({...old,[entity]:result.nextOffset}));
    }
  }
  async function loadMore(entity: Entity, q: string) {
    const offset = nextOffsets[entity]; if (offset == null) return;
    await run(async () => {
      if (entity === 'vehicles') {
        if (canFinance) {
          const result = await mobileApi.v2Inventory(store.id,offset,q);
          setRows((old) => ({...old,vehicles:[...(old.vehicles??[]),...result.vehicles as V2Record[]]}));
          setNextOffsets((old) => ({...old,vehicles:result.nextOffset}));
        } else {
          const result = await mobileApi.vehiclesPage(store.id,q,offset);
          setRows((old) => ({...old,vehicles:[...(old.vehicles??[]),...result.vehicles.map((item) => ({...item,id:item.id,model_name:item.modelName,management_no:item.managementNo}))]}));
          setNextOffsets((old) => ({...old,vehicles:result.nextOffset}));
        }
      } else {
        const result = await mobileApi.v2List(store.id,entity,{offset:String(offset),...(q?{q}:{})});
        setRows((old) => ({...old,[entity]:[...(old[entity]??[]),...result.rows]}));
        setNextOffsets((old) => ({...old,[entity]:result.nextOffset}));
      }
    });
  }
  async function loadToday() {
    const result = await mobileApi.today(store.id) as unknown as Record<string, unknown>;
    setToday(result);
    if (result.inventoryMetrics && typeof result.inventoryMetrics === 'object') setMetrics(result.inventoryMetrics as Record<string, number>);
  }
  const searchQuery = search[route.tab];
  const refreshRoute = useEffectEvent(() => { if (route.kind !== 'tab') return; const target=route.tab; void run(() => target === 'today' ? loadToday() : load(target as Entity, search[target]),true); });
  const handleHardwareBack = useEffectEvent(() => { if (route.kind !== 'tab') { back(); return true; } return false; });
  useEffect(() => {
    const timer = setTimeout(() => refreshRoute(), 180);
    return () => clearTimeout(timer);
  }, [route.kind, route.tab, store.id, searchQuery]);
  useEffect(() => { if (Platform.OS !== 'android') return; const listener = BackHandler.addEventListener('hardwareBackPress', () => handleHardwareBack()); return () => listener.remove(); }, []);
  async function readDetail(entity: Entity, id: string) {
    const result = await run(async () => {
      if (entity === 'vehicles') {
        const inventory = canFinance ? (await mobileApi.v2PurchaseDetail(store.id,id)).vehicle : (rows.vehicles ?? []).find((item) => item.id === id);
        const detail = await mobileApi.detail(store.id, id);
        setPhotos(detail.imageFiles.map((file) => ({ id: file.id, photo_category: (file as { photo_category?: string | null }).photo_category ?? null })));
        return { ...detail.vehicle, ...inventory, inspection_expiry_date: detail.vehicle.inspectionExpiryDate, liability_insurance_expiry_date: detail.vehicle.liabilityInsuranceExpiryDate, id } as V2Record;
      }
      const record = await mobileApi.v2Detail(store.id, entity, id);
      if (entity === 'maintenance') setPhotos((await mobileApi.v2Photos(store.id, 'maintenance_job', id)).photos);
      if (entity === 'tradeIns') setPhotos((await mobileApi.v2Photos(store.id,'trade_in_vehicle',id)).photos);
      if (entity === 'deals' || entity === 'customers' || entity === 'maintenance') {
        const filter: Record<string,string> = entity === 'deals' ? { dealId: id } : entity === 'customers' ? { customerId: id } : { maintenanceJobId: id };
        const [quotes, invoices] = await Promise.all([mobileApi.quotesFor(store.id, filter), mobileApi.v2Invoices(store.id, { [entity === 'deals' ? 'deal_id' : entity === 'customers' ? 'customer_id' : 'maintenance_job_id']: id })]);
        setRelatedQuotes(quotes.quotes); setRelatedInvoices(invoices.invoices);
        if (entity === 'deals') {
          const [tradeIns, appointments] = await Promise.all([mobileApi.v2List(store.id,'tradeIns',{deal_id:id}),mobileApi.v2List(store.id,'appointments',{deal_id:id})]);
          setRelatedTradeIns(tradeIns.rows); setRelatedAppointments(appointments.rows);
        } else if (entity === 'customers') {
          const appointments = await mobileApi.v2List(store.id,'appointments',{customer_id:id});
          setRelatedAppointments(appointments.rows); setRelatedTradeIns([]);
          const relations = await mobileApi.customerDetail(store.id,id);
          setCustomerVehicles(relations.vehicles); setCustomerMaintenance(relations.maintenance); setCustomerDeals(relations.deals);
        } else { setRelatedTradeIns([]); setRelatedAppointments([]); }
      }
      return record.row;
    },true);
    if (result) setCurrent(result);
  }
  async function open(entity: Entity, id: string, tab: Tab) {
    setDetailTab(entity === 'maintenance' ? '受付' : '基本');
    push({ kind: 'detail', entity, id, tab });
    await readDetail(entity,id);
  }
  async function openQuote(id: string, tab: Tab) {
    setQuoteView(null);
    push({kind:'quoteDetail',tab,id});
    const quote = await run(() => mobileApi.quoteDetail(store.id,id),true);
    if (quote) setQuoteView(quote);
  }
  async function openInvoice(id: string, tab: Tab) {
    setInvoiceView(null);
    push({kind:'invoiceDetail',tab,id});
    const invoice = await run(() => mobileApi.v2InvoiceDetail(store.id,id),true);
    if (invoice) { setInvoiceView(invoice.invoice); setInvoiceItems(invoice.items); }
  }
  function webDocumentPreview(html: string) {
    const preview = window.open('', '_blank');
    if (!preview) throw new Error('帳票プレビューのポップアップを許可してください。');
    preview.opener = null;
    preview.document.open(); preview.document.write(html); preview.document.close();
  }
  async function shareQuote(quote: Quote) {
    await run(async () => {
      if (Platform.OS === 'web') { webDocumentPreview(quoteHtml(quote)); return; }
      const result = await Print.printToFileAsync({html:quoteHtml(quote)});
      if (!await Sharing.isAvailableAsync()) throw new Error('共有機能を利用できません。');
      await Sharing.shareAsync(result.uri,{mimeType:'application/pdf',dialogTitle:'見積書を共有'});
    });
  }
  async function printQuote(quote: Quote) { await run(async () => { if (Platform.OS === 'web') { webDocumentPreview(quoteHtml(quote)); return; } await Print.printAsync({html:quoteHtml(quote)}); }); }
  async function issueInvoice(id: string) {
    const saved = await run(() => mobileApi.v2IssueInvoice(store.id,id,operationId));
    if (saved) { setOperationId(operationKey()); const result = await run(() => mobileApi.v2InvoiceDetail(store.id,id),true); if (result) setInvoiceView(result.invoice); }
  }
  async function shareInvoice(invoice: V2Record) {
    await run(async () => { if (Platform.OS === 'web') { webDocumentPreview(documentHtml('invoice',invoice,invoiceItems)); return; } const printed = await Print.printToFileAsync({html:documentHtml('invoice',invoice,invoiceItems)}); if (!await Sharing.isAvailableAsync()) throw new Error('共有機能を利用できません。'); await Sharing.shareAsync(printed.uri,{mimeType:'application/pdf',dialogTitle:'請求書を共有'}); });
  }
  const title = route.kind === 'tab' ? ({ today:'今日', vehicles:'車両', deals:'商談', maintenance:'整備', customers:'顧客' } as const)[route.tab] : route.kind === 'form' ? ({ vehicles:'仕入登録', customers:'顧客登録', deals:'商談登録', maintenance:'整備受付', appointments:'予約登録', tradeIns:'下取り査定' } as Record<Entity,string>)[route.entity] : ({ detail:'詳細', photo:'写真を追加', quote:'見積を作る', quoteDetail:'見積詳細', invoice:'請求を作る', invoiceDetail:'請求詳細', payment:'入金を登録', sale:'成約にする', delivery:'納車を完了', cancel:'売約取消' } as Record<string,string>)[route.kind];
  if (!businessReady) return <Shell title={title} tab={route.tab} onTab={tab} onBack={onStore} onLogout={onLogout} busy={!businessError} error={businessError || undefined}><Text>店舗設定を確認しています。</Text></Shell>;
  return <Shell title={title} tab={route.tab} onTab={tab} onBack={route.kind === 'tab' ? onStore : back} onLogout={onLogout} busy={busy} error={error}>
    {route.kind === 'tab' && <TabContent tab={route.tab} today={today} metrics={metrics} rows={rows} search={search[route.tab]} hasMore={route.tab !== 'today' && nextOffsets[route.tab] != null} onMore={() => { if (route.tab !== 'today') void loadMore(route.tab,search[route.tab]); }} onSearch={(text) => setSearch((old) => ({ ...old, [route.tab]: text }))} onOpen={(entity, id) => void open(entity, id, route.tab)} onInvoice={(id) => void openInvoice(id, route.tab)} onCreate={(entity, preset) => startForm(entity, route.tab, preset)} canWrite={canWrite} canFinance={canFinance} />}
    {route.kind === 'detail' && current?.id === route.id && current && <DetailContent row={current} entity={route.entity} tab={detailTab} setTab={setDetailTab} photos={photos} storeId={store.id} rows={rows} relatedQuotes={relatedQuotes} relatedInvoices={relatedInvoices} canWrite={canWrite && !busy} canFinance={canFinance && !busy} onEdit={() => startForm(route.entity, route.tab, editDraft(route.entity, current,businessMode), current.id)} onCreate={(entity,preset) => startForm(entity, route.tab, preset)} onPhoto={(type) => push({ kind:'photo', tab:route.tab, relatedType:type, id:current.id })} onQuote={() => { const customerId = str(current,'customer_id') || (route.entity === 'customers' ? current.id : ''); const vehicleId = str(current,'vehicle_id') || (route.entity === 'vehicles' ? current.id : undefined); setDraft(route.entity === 'maintenance' ? maintenanceQuoteDraft(current,businessMode) : route.entity === 'vehicles' ? vehicleQuoteDraft(num(current,'listing_price'),businessMode) : {quoteMode:businessMode,quoteCount:'1',quoteName0:'見積項目',quotePrice0:'0'}); setOperationId(operationKey()); push({ kind:'quote', tab:route.tab, customerId, vehicleId, dealId:route.entity === 'deals' ? current.id : undefined, jobId:route.entity === 'maintenance' ? current.id : undefined }); }} onSale={() => { setDraft({ salePrice:String(num(current,'budget') || 0) }); setOperationId(operationKey()); push({ kind:'sale', tab:route.tab, dealId:current.id }); }} onDelivery={() => { setOperationId(operationKey()); push({ kind:'delivery', tab:route.tab, dealId:current.id }); }} onInvoice={(quoteId) => { setFormId(clientId()); push({ kind:'invoice', tab:route.tab, quoteId }); }} onPayment={(invoiceId) => { setOperationId(operationKey()); push({ kind:'payment', tab:route.tab, invoiceId }); }} onQuoteDetail={(id) => void openQuote(id,route.tab)} onInvoiceDetail={(id) => void openInvoice(id,route.tab)} onStatus={(status) => void updateStatus(route.entity, current.id, status)} />}
    {route.kind === 'detail' && current?.id === route.id && current && ['deals','customers','maintenance'].includes(route.entity) && <Card title="関連履歴">{relatedAppointments.map((item) => <Row key={item.id} title={`予約 ${str(item,'scheduled_at')}`} subtitle={str(item,'status')} onPress={() => void open('appointments',item.id,route.tab)} />)}{relatedTradeIns.map((item) => <Row key={item.id} title={`査定 ${str(item,'maker')} ${str(item,'model_name')}`} subtitle={yen(num(item,'appraisal_amount'))} onPress={() => void open('tradeIns',item.id,route.tab)} />)}{relatedQuotes.map((item) => <Row key={item.id} title={`見積 ${item.quoteNo || ''}`} subtitle={yen(item.totalAmount || 0)} onPress={() => void openQuote(item.id,route.tab)} />)}{relatedInvoices.map((item) => <Row key={item.id} title={`請求 ${str(item,'invoice_no')}`} subtitle={yen(num(item,'unpaid_amount'))} onPress={() => void openInvoice(item.id,route.tab)} />)}{!relatedAppointments.length && !relatedTradeIns.length && !relatedQuotes.length && !relatedInvoices.length && <Text>関連履歴はありません。</Text>}</Card>}
    {route.kind === 'detail' && current?.id === route.id && current && route.entity === 'customers' && <Card title="顧客の車両・商談・整備">{customerVehicles.map((item) => <Row key={item.id} title={`${item.maker || ''} ${item.modelName || ''}`.trim() || '車両'} onPress={() => void open('vehicles',item.id,route.tab)} />)}{customerDeals.map((item) => <Row key={item.id} title={item.title || '商談'} onPress={() => void open('deals',item.id,route.tab)} />)}{customerMaintenance.map((item) => <Row key={item.id} title={item.job_no || '整備'} onPress={() => void open('maintenance',item.id,route.tab)} />)}</Card>}
    {route.kind === 'detail' && current?.id === route.id && current && route.entity === 'deals' && str(current,'status') === '成約' && canFinance && <Card title="危険操作"><Button title="売約を取り消す" danger onPress={() => { setDraft({cancelReason:''}); setOperationId(operationKey()); push({kind:'cancel',tab:route.tab,dealId:current.id}); }} /></Card>}
    {route.kind === 'form' && <FormContent storeId={store.id} route={route} step={step} setStep={setStep} draft={draft} value={value} set={set} rows={rows} onSave={() => void saveForm(route)} canWrite={canWrite} canFinance={canFinance} busy={busy} />}
    {route.kind === 'photo' && <PhotoContent value={value('photoCategory') || '入庫時'} onChange={(text) => set('photoCategory', text)} onCapture={(camera) => void savePhoto(route, camera)} busy={busy} />}
    {route.kind === 'quote' && <QuoteContent route={route} draft={draft} set={set} onSave={() => void saveQuote(route)} busy={busy} />}
    {route.kind === 'quoteDetail' && quoteView && <Card title={quoteView.quoteNo || '見積'}><Info label="顧客" value={quoteView.customerName} />{quoteView.items.map((item,index) => <Info key={item.id || index} label={item.name} value={yen(item.amount ?? item.quantity * item.unitPrice)} />)}<Info label="合計" value={yen(quoteView.totalAmount ?? 0)} /><Button title="PDFを保存・共有" onPress={() => void shareQuote(quoteView)} /><Button title="印刷" secondary onPress={() => void printQuote(quoteView)} /><Button title="請求を作る" secondary onPress={() => { setFormId(clientId()); push({kind:'invoice',tab:route.tab,quoteId:quoteView.id}); }} disabled={!canFinance} /></Card>}
    {route.kind === 'quoteDetail' && quoteView && <Button title="見積をコピー" secondary disabled={!canWrite} onPress={() => { setDraft(quoteCopyDraft(quoteView)); setOperationId(operationKey()); push({kind:'quote',tab:route.tab,customerId:quoteView.customerId || '',vehicleId:quoteView.vehicleId || undefined,dealId:quoteView.dealId || undefined,jobId:quoteView.maintenanceJobId || undefined}); }} />}
    {route.kind === 'invoice' && <InvoiceContent quoteId={route.quoteId} value={value('dueDate')} set={(text) => set('dueDate', text)} onSave={() => void saveInvoice(route.quoteId)} busy={busy} />}
    {route.kind === 'invoiceDetail' && invoiceView && <Card title={str(invoiceView,'invoice_no') || '請求'}><Info label="顧客" value={str(invoiceView,'customer_name')} />{invoiceItems.map((item,index) => <Info key={str(item,'id') || index} label={str(item,'name')} value={yen(num(item,'amount'))} />)}<Info label="請求額" value={yen(num(invoiceView,'total_amount'))} /><Info label="未入金" value={yen(num(invoiceView,'unpaid_amount'))} /><Info label="状態" value={str(invoiceView,'issue_status')} /><Button title="請求を発行" onPress={() => void issueInvoice(invoiceView.id)} disabled={!canFinance || str(invoiceView,'issue_status') === 'issued'} /><Button title="PDFを保存・共有" secondary onPress={() => void shareInvoice(invoiceView)} /><Button title="入金を登録" secondary onPress={() => { setDraft({paymentAmount:String(num(invoiceView,'unpaid_amount'))}); setOperationId(operationKey()); push({kind:'payment',tab:route.tab,invoiceId:invoiceView.id}); }} disabled={!canFinance || str(invoiceView,'issue_status') !== 'issued' || num(invoiceView,'unpaid_amount') <= 0} /></Card>}
    {route.kind === 'invoiceDetail' && invoiceView && <Button title="請求をコピー" secondary disabled={!canFinance} onPress={() => {
      const copied = {id:invoiceView.id,title:str(invoiceView,'title'),subtotalAmount:num(invoiceView,'subtotal_amount'),taxAmount:num(invoiceView,'tax_amount'),taxDisplayMode:str(invoiceView,'tax_display_mode') || undefined,discountInputAmount:invoiceView.discount_input_amount == null ? undefined : num(invoiceView,'discount_input_amount'),discountAmount:num(invoiceView,'discount_amount'),tradeInAmount:num(invoiceView,'trade_in_amount'),customerNote:str(invoiceView,'customer_note'),items:invoiceItems.map((item)=>({name:str(item,'name'),itemType:str(item,'item_type'),quantity:num(item,'quantity'),unitPrice:num(item,'unit_price'),taxRate:num(item,'tax_rate'),taxCategory:str(item,'tax_category') || 'taxable',unit:str(item,'unit'),note:str(item,'note'),lineDiscountInputAmount:num(item,'line_discount_input_amount'),partId:str(item,'part_id') || undefined,costPrice:item.cost_price == null ? undefined : num(item,'cost_price')}))} as Parameters<typeof quoteCopyDraft>[0];
      const next = quoteCopyDraft(copied); delete next.quoteSourceId; setDraft(next); setOperationId(operationKey()); push({kind:'quote',tab:route.tab,invoiceSourceId:invoiceView.id,customerId:str(invoiceView,'customer_id'),vehicleId:str(invoiceView,'vehicle_id') || undefined});
    }} />}
    {route.kind === 'payment' && <PaymentContent value={value} set={set} onSave={() => void savePayment(route.invoiceId)} busy={busy} />}
    {route.kind === 'sale' && <Card title="成約内容を確認"><Field label="実販売価格" value={value('salePrice')} onChange={(text) => set('salePrice', text)} numeric /><Button title="成約を確定" onPress={() => void sale(route.dealId)} disabled={busy} /></Card>}
    {route.kind === 'delivery' && <Card title="納車確認"><Text>対象車両と商談を確認して完了してください。</Text><Button title="納車を完了" onPress={() => void deliver(route.dealId)} disabled={busy} /></Card>}
    {route.kind === 'cancel' && <Card title="売約取消を確認"><Text>請求・入金がある場合は取消できません。理由を入力して確定してください。</Text><Field label="取消理由" value={value('cancelReason')} onChange={(text) => set('cancelReason',text)} multiline /><Button title="理由を確認して取り消す" danger onPress={() => void cancelSale(route.dealId)} disabled={busy || !value('cancelReason').trim()} /></Card>}
  </Shell>;

  async function saveForm(target: Extract<Route,{kind:'form'}>) {
    if (!canWrite) return;
    const payload = formPayload(target.entity, draft, formId, Boolean(target.id));
    if (!payload) { setError('必須項目と金額・日付を確認してください。'); return; }
    if (target.entity === 'vehicles') for (const key of vehicleTaxablePrices) {
      if (payload[key] == null) continue;
      const originals = JSON.parse(draft._vehiclePrices || '{}') as Record<string,number|null>;
      const original = target.id ? originals[key] : undefined;
      payload[key] = original != null && Number(payload[key]) === storedPriceToDisplay(Number(original),businessMode) ? Number(original) : displayPriceToStored(Number(payload[key]),businessMode);
    }
    const inlineBody = { id:formId, jobId:target.id, job:payload, customer:value('inlineCustomer') === 'new' ? {name:value('newCustomerName'),birth_date:value('newCustomerBirth'),postal_code:value('newCustomerPostal'),address:value('newCustomerAddress'),phone:value('newCustomerPhone')} : null, vehicle:value('inlineVehicle') === 'new' ? {vin:value('newVehicleVin'),maker:value('newVehicleMaker'),model_name:value('newVehicleModel'),registration_no:value('newVehicleRegistration') || null,inspection_expiry_date:value('newVehicleInspection') || null,liability_insurance_expiry_date:value('newVehicleInsurance') || null} : null };
    const saved = await run(async () => target.entity === 'maintenance' && (inlineBody.customer || inlineBody.vehicle) ? mobileApi.maintenanceInline(store.id,inlineBody) : target.entity === 'vehicles'
      ? target.id ? mobileApi.v2PurchaseUpdate(store.id, target.id, payload) : mobileApi.v2Purchase(store.id, payload as Parameters<typeof mobileApi.v2Purchase>[1])
      : target.id ? mobileApi.v2Update(store.id, target.entity, target.id, payload) : mobileApi.v2Create(store.id, target.entity, payload as V2Record));
    if (!saved) return;
    await run(() => load(target.entity === 'tradeIns' || target.entity === 'appointments' ? target.tab === 'vehicles' ? 'vehicles' : target.tab === 'maintenance' ? 'maintenance' : 'deals' : target.entity));
    if (target.id) { back(); return; }
    const savedRow = 'vehicle' in saved ? saved.vehicle : saved.row;
    if (savedRow?.id) {
      setStack((items) => items.slice(0,-1));
      setDetailTab(target.entity === 'vehicles' ? '写真' : target.entity === 'maintenance' ? '受付' : '基本');
      setRoute({kind:'detail',tab:target.tab,entity:target.entity,id:savedRow.id});
      await readDetail(target.entity,savedRow.id);
    } else back();
  }
  async function updateStatus(entity: Entity, id: string, status: string) {
    if (!canWrite) return;
    const result = await run(async () => entity === 'maintenance' ? mobileApi.updateMaintenance(store.id,id,status,operationId) : mobileApi.v2Update(store.id,entity as V2Resource,id,{ status }));
    if (result) { setOperationId(operationKey()); await readDetail(entity,id); }
  }
  async function savePhoto(target: Extract<Route,{kind:'photo'}>, camera: boolean) {
    if (!canWrite) return;
    const result = await run(async () => {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('写真へのアクセス許可が必要です。');
      const selected = camera ? await ImagePicker.launchCameraAsync({ mediaTypes:['images'], quality:0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], quality:0.8 });
      if (selected.canceled || !selected.assets[0]) return null;
      return mobileApi.uploadCategorizedPhoto(store.id,target.relatedType,target.id,value('photoCategory') || '入庫時',selected.assets[0]);
    });
    if (result) back();
  }
  async function saveQuote(target: Extract<Route,{kind:'quote'}>) {
    const items = parseQuoteItems(draft);
    if (!items.length || !target.customerId) { setError('顧客と明細を確認してください。'); return; }
    const document: Parameters<typeof mobileApi.createQuote>[2] = { customerId:target.customerId, vehicleId:target.vehicleId, dealId:target.dealId, maintenanceJobId:target.jobId, title:value('quoteTitle') || 'お見積', issueDate:day(), customerNote:value('quoteNote'), sourceQuoteId:value('quoteSourceId') || undefined, taxDisplayMode:value('quoteMode') === 'excluded' ? 'excluded' : 'included', discountInputAmount:Number(value('quoteDiscount') || 0), tradeInAmount:Number(value('quoteTradeIn') || 0), items };
    if (target.invoiceSourceId) {
      const sourceInvoiceId = target.invoiceSourceId;
      const invoice = await run(() => mobileApi.copyInvoice(store.id,{...document,sourceInvoiceId}));
      if(invoice) { setStack((old)=>old.slice(0,-1)); await openInvoice(invoice.id,target.tab); }
      return;
    }
    const saved = await run(() => mobileApi.createQuote(store.id,operationId,document));
    if (!saved) return;
    setOperationId(operationKey());
    setQuoteView(saved);
    setStack((old) => old.slice(0,-1));
    setRoute({kind:'quoteDetail',tab:target.tab,id:saved.id});
  }
  async function saveInvoice(quoteId: string) {
    const invoice = await run(() => mobileApi.v2InvoiceFromQuote(store.id,formId,quoteId,value('dueDate') || undefined));
    if (!invoice) return;
    const readback = await run(() => mobileApi.v2InvoiceDetail(store.id,invoice.invoice.id));
    if (!readback) return;
    setInvoiceView(readback.invoice);
    setInvoiceItems(readback.items);
    setStack((old) => old.slice(0,-1));
    setRoute({kind:'invoiceDetail',tab:route.tab,id:invoice.invoice.id});
  }
  async function savePayment(invoiceId: string) {
    const amount = Number(value('paymentAmount'));
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError('入金額を確認してください。'); return; }
    const saved = await run(() => mobileApi.v2Payment(store.id,invoiceId,amount,value('paymentMethod') || '振込',operationId));
    if (saved) { setOperationId(operationKey()); const invoice = await run(() => mobileApi.v2InvoiceDetail(store.id,invoiceId)); if (invoice) { setInvoiceView(invoice.invoice); setInvoiceItems(invoice.items); } back(); }
  }
  async function sale(dealId: string) {
    const price = Number(value('salePrice'));
    if (!Number.isSafeInteger(price) || price < 0) { setError('実販売価格を確認してください。'); return; }
    const saved = await run(() => mobileApi.v2Sale(store.id,dealId,price,operationId));
    if (saved) { setOperationId(operationKey()); back(); await load('deals'); }
  }
  async function deliver(dealId: string) {
    const saved = await run(() => mobileApi.v2Delivery(store.id,dealId,operationId));
    if (saved) { setOperationId(operationKey()); back(); await load('deals'); }
  }
  async function cancelSale(dealId: string) {
    const reason = value('cancelReason').trim();
    if (!reason || reason.length > 100) { setError('取消理由は1〜100文字で入力してください。'); return; }
    const saved = await run(() => mobileApi.v2CancelSale(store.id,dealId,reason,operationId));
    if (saved) { setOperationId(operationKey()); back(); await load('deals'); }
  }
}
