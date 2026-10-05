import type { Metadata } from 'next';
import Link from 'next/link';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import { GARAGE_PLAN_ORDER, GARAGE_PLANS } from '@/lib/billing/garagePlans';
import { PublicActions, PublicSiteFrame } from './PublicSiteChrome';
import styles from './public-cv.module.css';

export type GaragePublicPageKey = 'features' | 'pricing' | 'faq' | 'industries/used-car' | 'industries/motorcycle' | 'industries/maintenance';
const free = GARAGE_PLANS.free;
export const publicFaqs = [
  { question: 'どんな店舗向けですか？', answer: '中古車販売店、バイク販売・修理店、整備工場向けです。車両・顧客・商談・見積・整備をまとめて管理できます。' },
  { question: '無料で使える範囲は？', answer: `Freeは月額0円。在庫${free.inventoryLimit}台、スタッフ${free.includedStaffCount}人、${free.includedStoreCount}店舗、見積・請求は月${free.quoteInvoiceLimit}件まで使えます。` },
  { question: 'カード登録は必要ですか？', answer: '無料登録にカード情報は必要ありません。まず1台から操作を試せます。' },
  { question: 'Excelのデータを移せますか？', answer: '顧客・車両のデータをCSVで移せます。すべてを一度に移さず、まず1台で使い方を確かめられます。' },
  { question: 'デモのデータは保存されますか？', answer: '保存されません。デモは登録前に操作を確かめるためのものです。実際の店舗データは無料登録後に入力してください。' },
  { question: 'スタッフや店舗を増やせますか？', answer: 'はい。プランに応じて人数・店舗数を増やせます。追加料金と対象プランは料金ページで確認できます。' },
  { question: 'スタッフごとに見られる情報を分けられますか？', answer: '店舗内の役割に応じて、閲覧や操作の範囲を分けられます。' },
  { question: 'L-LINKとの連携は使えますか？', answer: 'L-LINK連携は現在提供準備中です。利用開始時期は決まり次第ご案内します。車両・顧客・商談・見積・整備の管理は現在利用できます。' },
];
const content = {
  features: { title:'車両から、仕事がつながる。', description:'車両・顧客・商談・見積・整備をまとめる、GARAGE LINKの製品と機能。', lead:'在庫を確認し、顧客と商談をつなぎ、見積から整備まで。同じ車両の情報を店舗で共有できます。', rows:[['車両','仕入・原価・販売状態・在庫日数を、車両ごとに確認。'],['顧客','連絡先と希望条件を、車両や商談と一緒に記録。'],['商談','対象車両・見積・次回連絡日をまとめて、次の対応を確認。'],['見積・請求','車両・部品・整備の明細を使い、見積から請求へ引き継ぐ。'],['整備','入庫・作業・担当・納車予定・次回車検を確認。']] },
  pricing: {title:'月額0円から。',description:'GARAGE LINKの料金。Freeは月額0円、カード登録不要。在庫台数・人数・店舗数に合わせた4プラン。',lead:'まずはFreeで1台から。台数や人数が増えたら、店舗に合うプランを選べます。',rows:[]},
  faq: {title:'登録前の疑問を、ここで。',description:'対象店舗、無料範囲、カード登録、CSV移行、デモ、スタッフ・店舗追加、連携の提供状況。',lead:'無料で試す前に、気になることだけ確認してください。',rows:[]},
  'industries/used-car': {title:'在庫から納車まで、1台で。',description:'中古車販売店の在庫・顧客・商談・見積を車両ごとに管理するGARAGE LINK。',lead:'仕入原価も、次の商談も。同じ車両の情報から確認できます。',rows:[['在庫を見る','仕入日・原価・在庫日数・掲載状態を記録。'],['商談をつなぐ','希望車両・来店予定・見積・次回連絡日を顧客と共有。'],['納車まで確認','請求・入金・納車予定を同じ情報から確認。']]},
  'industries/motorcycle': {title:'販売も修理も、同じ台帳で。',description:'バイク販売・修理店の販売車両・修理入庫・部品・見積・納車をまとめるGARAGE LINK。',lead:'販売と修理が並行しても、車両・担当・納車予定が分かります。',rows:[['販売車両を管理','車種・仕入・販売状態・保管場所を確認。'],['修理を共有','依頼内容・使用部品・担当・納車予定を記録。'],['見積を残す','部品・工賃・追加作業の内容と金額を明細に。']]},
  'industries/maintenance': {title:'入庫から納車まで、ひと続き。',description:'整備工場の予約・顧客・車両・作業・見積・請求・車検期限をまとめるGARAGE LINK。',lead:'受付と整備が、同じ車両・作業予定を確認できます。',rows:[['今日の入庫を確認','予約・依頼内容・担当・納車予定を一覧で。'],['作業を共有','進行状況・部品・工賃を記録し、見積や請求へ。'],['次の車検を記録','納車日と次回点検・車検の期限を顧客・車両に残す。']]},
} satisfies Record<GaragePublicPageKey,{title:string;description:string;lead:string;rows:string[][]}>;

export function buildGaragePublicMetadata(key: GaragePublicPageKey): Metadata {
  const page = content[key];
  return { title: key === 'features' ? '製品・機能' : key === 'pricing' ? '料金' : key === 'faq' ? 'よくある質問' : page.title, description:page.description, alternates:{canonical:`/${key}`}, openGraph:{title:page.title,description:page.description,url:`/${key}`} };
}

export function GaragePublicPage({pageKey}:{pageKey:GaragePublicPageKey}) {
  const page=content[pageKey];
  return <PublicSiteFrame source={pageKey}><main className={`${styles.content} ${pageKey==='faq'?styles.narrow:''}`} data-page={pageKey}>
    <AcquisitionPageTracker source={pageKey} placement={`public_${pageKey.replace('/','_')}`} />
    <div className={styles.intro}>{pageKey.startsWith('industries/') && <p className={styles.eyebrow}>{pageKey.endsWith('used-car')?'中古車販売店向け':pageKey.endsWith('motorcycle')?'バイク販売・修理店向け':'整備工場向け'}</p>}<h1>{page.title}</h1><p>{page.lead}</p></div>
    {pageKey==='pricing' ? <>
      <div className={styles.plans}>{GARAGE_PLAN_ORDER.map(code=>{const plan=GARAGE_PLANS[code];return <section className={styles.plan} key={code}><h2>{plan.name}</h2><strong className={styles.price}>{plan.monthlyPrice.toLocaleString('ja-JP')}<span style={{fontSize:14,letterSpacing:0}}> 円／月</span></strong><p>{code==='free'?'カード登録不要':'請求総額'}</p><dl><div><dt>在庫</dt><dd>{plan.inventoryLimit}台</dd></div><div><dt>スタッフ</dt><dd>{plan.includedStaffCount}人</dd></div><div><dt>店舗</dt><dd>{plan.includedStoreCount}店舗</dd></div><div><dt>見積・請求</dt><dd>{plan.quoteInvoiceLimit===null?'上限なし':`月${plan.quoteInvoiceLimit}件`}</dd></div></dl></section>;})}</div>
      <p className={styles.note}>有料プランの表示額は、基準料金に10%相当額を加えた請求総額です。</p>
      <PublicActions source="pricing" placement="pricing_free_plan" />
      <section className={styles.section}><h2>必要になったら、追加できます。</h2><div className={styles.rows}>{[['追加スタッフ','月額1,100円／人。対象プランで利用できます。'],['追加店舗','月額5,500円／店舗。Standard・Proが対象です。'],['保存容量','月額550円／10GB。Starter・Standard・Proが対象です。']].map(([title,body])=><div className={styles.row} key={title}><h3>{title}</h3><p>{body}</p></div>)}</div><p className={styles.note}>L-LINK連携はStandard・Proで提供準備中です。</p></section>
    </> : pageKey==='faq' ? <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'FAQPage',mainEntity:publicFaqs.map(item=>({'@type':'Question',name:item.question,acceptedAnswer:{'@type':'Answer',text:item.answer}}))})}} />
      <div className={styles.faq}>{publicFaqs.map(item=><details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div><p className={styles.note}>人数・店舗数と追加料金は<Link href="/pricing">料金ページ</Link>で確認できます。</p>
    </> : <>
      <div className={styles.rows}>{page.rows.map(([title,body])=><section className={styles.row} key={title}><h2>{title}</h2><p>{body}</p></section>)}</div>
      {pageKey==='industries/used-car' && <p className={styles.note}><Link href="/solutions/used-car-inventory-management">Excelからの在庫管理を詳しく見る</Link></p>}
      {pageKey==='industries/maintenance' && <p className={styles.note}><Link href="/solutions/maintenance-customer-management">整備工場の顧客管理を詳しく見る</Link></p>}
    </>}
    <section className={styles.final}><h2>まず1台、無料で試す。</h2><PublicActions source={pageKey} /><p className={styles.note}>Free 0円・カード登録不要。登録前なら、保存されないデモで確かめられます。</p></section>
  </main></PublicSiteFrame>;
}
