import Link from 'next/link';
import { AcquisitionPageTracker } from '@/components/analytics/AcquisitionPageTracker';
import type { DemoScenario } from '@/components/landing/demo/garageDemoData';
import { PublicActions, PublicSiteFrame } from './PublicSiteChrome';
import styles from './public-cv.module.css';
export type SeoIntentPageProps = {
  source:string; eyebrow:string; title:string; lead:string; demoScenario:DemoScenario;
  problems:Array<{title:string;body:string}>; capabilities:Array<{title:string;body:string}>;
  fit:string[]; notFit:string[]; relatedHref:string; relatedLabel:string; faq:Array<{q:string;a:string}>;
};
export function SeoIntentPage({source,eyebrow,title,lead,capabilities,fit,notFit,relatedHref,relatedLabel,faq}:SeoIntentPageProps) {
  return <PublicSiteFrame source={source}><main className={styles.content}>
    <AcquisitionPageTracker source={source} placement="seo_intent" />
    <div className={styles.intro}><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p>{lead}</p><PublicActions source={source} placement="seo_hero" /><p className={styles.note}>Free 0円・在庫5台・スタッフ1人・1店舗。カード登録不要。</p></div>
    <section className={styles.section}><h2>台帳を探し直さず、次の仕事へ。</h2><div className={styles.rows}>{capabilities.map(item=><div className={styles.row} key={item.title}><h3>{item.title}</h3><p>{item.body}</p></div>)}</div></section>
    <section className={styles.section}><h2>こんな毎日に、使えます。</h2><ul>{fit.map(item=><li key={item}>{item}</li>)}</ul><details className={styles.note}><summary>対応していないことも確認する</summary><ul>{notFit.map(item=><li key={item}>{item}</li>)}</ul></details></section>
    <section className={styles.section}><h2>よくある質問</h2><div className={styles.faq}>{faq.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></section>
    <p className={styles.note}><Link href={relatedHref}>{relatedLabel}</Link></p>
    <section className={styles.final}><h2>今日の1台で、試してみる。</h2><PublicActions source={source} placement="seo_final" /><p className={styles.note}>デモのデータは保存されません。実際のデータは登録後に。</p></section>
  </main></PublicSiteFrame>;
}
