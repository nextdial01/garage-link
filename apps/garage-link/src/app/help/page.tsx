import type { Metadata } from 'next';
import { PublicActions, PublicSiteFrame } from '@/components/public-site/PublicSiteChrome';
import styles from '@/components/public-site/public-cv.module.css';
export const metadata: Metadata = {title:'使い始め方',alternates:{canonical:'/help'},openGraph:{url:'/help'}};
export default function HelpPage() {
  return <PublicSiteFrame source="help"><main className={`${styles.content} ${styles.narrow}`}>
    <div className={styles.intro}><h1>まず1台から、始める。</h1><p>すべてのデータを移す前に、今日使う車両で操作を確かめましょう。</p></div>
    <div className={styles.rows}>{[['無料で登録','メール確認後に店舗名と担当者名を登録します。カード情報は不要です。'],['車両を1台登録','販売中・整備中など、今日確認したい車両から。'],['顧客と仕事をつなぐ','商談・見積・整備を同じ車両に記録できます。'],['必要なデータを移す','顧客・車両はCSVで移せます。会社情報や帳票設定はあとから整えられます。']].map(([title,body])=><section className={styles.row} key={title}><h2>{title}</h2><p>{body}</p></section>)}</div>
    <section className={styles.final}><h2>触ってからでも、始められます。</h2><PublicActions source="help" /><p className={styles.note}>デモのデータは保存されません。</p></section>
  </main></PublicSiteFrame>;
}
