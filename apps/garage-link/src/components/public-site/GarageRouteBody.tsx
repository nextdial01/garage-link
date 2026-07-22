import Link from "next/link";
import styles from "./route-layouts.module.css";

type RouteKey = "pricing" | "industries/used-car" | "industries/motorcycle" | "industries/maintenance" | "faq";

const plans = [
  { name: "Free", price: "0", note: "操作を試す", inventory: "5台", staff: "1人", stores: "1店舗", quote: "月5件", featured: false },
  { name: "Starter", price: "6,800", note: "小規模店舗", inventory: "50台", staff: "1人", stores: "1店舗", quote: "月20件", featured: false },
  { name: "Standard", price: "14,800", note: "店舗運用", inventory: "200台", staff: "3人", stores: "1店舗", quote: "上限なし", featured: true },
  { name: "Pro", price: "29,800", note: "複数店舗", inventory: "500台", staff: "10人", stores: "3店舗", quote: "上限なし", featured: false },
] as const;

const faqGroups = [
  { id: "business", title: "対象業種", items: [
    ["中古車販売店以外でも使えますか？", "はい。バイク販売・修理店、整備工場、車検を扱う店舗でも利用できます。業態に合わせて必要な機能から使い始められます。"],
    ["販売と整備を同じ店舗で行っています。", "販売車両の在庫と、整備・修理の入庫を同じ店舗台帳で管理できます。担当者と期限を分けて確認できます。"],
  ] },
  { id: "price", title: "無料範囲・料金", items: [
    ["無料で試せる範囲を教えてください。", "Freeプランは月額0円で、在庫5台、スタッフ1人、1店舗、見積・請求は月5件まで利用できます。登録時に決済情報の入力はありません。"],
    ["スタッフや店舗を追加できますか？", "対象プランでは、追加スタッフは月額1,000円／人、追加店舗は月額5,000円／店舗です。表示価格は税別です。"],
  ] },
  { id: "permission", title: "権限・連携", items: [
    ["スタッフごとに見られる情報を分けられますか？", "はい。店舗内の役割に応じて、閲覧や操作の範囲を分けられます。導入前に現在の担当範囲をご確認ください。"],
    ["L-LINK連携はどのプランで使えますか？", "L-LINK連携はStandardプランとProプランで利用できます。LINE側の設計・構築支援が必要な場合はL-touringをご案内します。"],
  ] },
] as const;

function PricingBody() {
  return (
    <div className={styles.routeBody}>
      <section className={styles.pricingHero}>
        <div className={styles.shell}>
          <p className={styles.eyebrow}>PRICE — 台数と人数で選ぶ</p>
          <h1><span className={styles.headlineLine}>月額0円から。</span><span className={styles.headlineLine}>店舗規模に合わせて</span><span className={styles.headlineLine}>4プラン。</span></h1>
          <p className={styles.heroLead}>在庫台数、利用人数、店舗数を基準に比較できます。Free登録時にカード情報は必要ありません。</p>
          <div className={styles.plans}>
            {plans.map((plan) => <article className={`${styles.plan} ${plan.featured ? styles.featured : ""}`} key={plan.name}>
              <span className={styles.planBadge}>{plan.note}</span><h2>{plan.name}</h2>
              <div className={styles.price}><strong>{plan.price}</strong><span>円／月・税別</span></div>
              <dl><div><dt>在庫</dt><dd>{plan.inventory}</dd></div><div><dt>スタッフ</dt><dd>{plan.staff}</dd></div><div><dt>店舗</dt><dd>{plan.stores}</dd></div><div><dt>見積・請求</dt><dd>{plan.quote}</dd></div></dl>
              {plan.name === "Free" && <Link className={styles.inlineCta} href="/signup">無料で始める</Link>}
            </article>)}
          </div>
        </div>
      </section>
      <section className={styles.detailSection}><div className={styles.shell}>
        <div className={styles.sectionHeader}><h2>追加が必要になった時の料金</h2><p>契約後の想定差を減らすため、プラン外の追加費用も登録前に確認できます。</p></div>
        <div className={styles.costRows}>
          <div className={styles.costRow}><strong>追加スタッフ</strong><b>月額1,000円／人</b><p>対象プランで、店舗の利用人数に合わせて追加できます。</p></div>
          <div className={styles.costRow}><strong>追加店舗</strong><b>月額5,000円／店舗</b><p>Standard・Proで、契約に含まれる店舗数を超える場合に追加できます。</p></div>
          <div className={styles.costRow}><strong>個別サポート</strong><b>60分10,000円</b><p>画面共有による個別支援です。通常のチャットサポートは各プランに含まれます。</p></div>
        </div>
      </div></section>
    </div>
  );
}

function UsedCarBody() {
  const stages = [
    ["01", "仕入", "原価と入庫日を登録"], ["02", "掲載", "媒体と販売状態を共有"], ["03", "問い合わせ", "顧客と希望車両を接続"], ["04", "商談", "見積と次回連絡を記録"], ["05", "納車", "請求と次回案内を残す"],
  ] as const;
  return <div className={styles.routeBody}>
    <section className={styles.vehicleHero}><div className={styles.shell}>
      <p className={styles.eyebrow}>USED CAR — 車両を中心に追う</p><h1><span className={styles.headlineLine}>仕入れた日から、</span><span className={styles.headlineLine}>納車後の案内まで。</span></h1>
      <p className={styles.heroLead}>在庫日数だけでも、商談予定だけでもありません。一台の車両に、売れるまでの経過と次の対応を集めます。</p>
      <div className={styles.vehiclePipeline}>{stages.map(([no,title,body]) => <article key={no}><span>{no}</span><h2>{title}</h2><p>{body}</p></article>)}</div>
    </div></section>
    <section className={styles.pipelineSection}><div className={styles.shell}>
      <div className={styles.sectionHeader}><h2>毎朝見るのは、在庫と次回対応</h2><p>登録件数ではなく、長く残っている車両と止まっている商談を先に確認します。</p></div>
      <div className={styles.dashboardStrip}>
        <article className={styles.metricPanel}><h3>在庫の状態</h3><div className={styles.metrics}><div><strong>日数</strong><span>仕入からの経過</span></div><div><strong>原価</strong><span>車両ごとの金額</span></div><div><strong>掲載</strong><span>媒体ごとの状態</span></div><div><strong>商談</strong><span>問い合わせ件数</span></div></div></article>
        <article className={styles.actionPanel}><h3>今日確認する商談</h3><ol><li>次回連絡日が今日の顧客</li><li>見積送付後に止まった商談</li><li>長期在庫にひも付く問い合わせ</li><li>納車予定日が近い案件</li></ol></article>
      </div>
    </div></section>
  </div>;
}

function MotorcycleBody() {
  return <div className={styles.routeBody}>
    <section className={styles.dualHero}><div className={styles.shell}>
      <p className={styles.eyebrow}>MOTORCYCLE — 販売と修理を分けずに共有</p><h1><span className={styles.headlineLine}>販売車両と修理入庫。</span><span className={styles.headlineLine}>二つの流れを、</span><span className={styles.headlineLine}>一つの店舗へ。</span></h1>
      <p className={styles.heroLead}>販売担当と整備担当が別でも、対象車両、顧客、担当、納期を同じ情報から確認できます。</p>
      <div className={styles.dualBoard}>
        <article className={`${styles.lane} ${styles.sales}`}><span>SALES LANE</span><h2>販売</h2><ul><li>仕入・在庫・保管場所</li><li>問い合わせ・商談・見積</li><li>販売状態・納車予定</li></ul></article>
        <div className={styles.merge}>顧客・車両・担当</div>
        <article className={`${styles.lane} ${styles.service}`}><span>SERVICE LANE</span><h2>修理・カスタム</h2><ul><li>依頼内容・入庫予定</li><li>使用部品・追加作業</li><li>工賃・請求・納車予定</li></ul></article>
      </div>
    </div></section>
    <section className={styles.laneSection}><div className={styles.shell}>
      <div className={styles.sectionHeader}><h2>二つの業務が重なる場所を残す</h2><p>同じ車両で販売と修理が並行しても、誰が何を待っているかが分かる形にします。</p></div>
      <div className={styles.workTable}><div className={styles.workRow}><span>追加作業</span><h3>説明した内容と金額</h3><p>当初見積と追加作業を分け、顧客へ説明した内容を明細へ残します。</p></div><div className={styles.workRow}><span>部品</span><h3>発注・入荷・使用</h3><p>作業に必要な部品と数量を記録し、納期判断に使います。</p></div><div className={styles.workRow}><span>納車</span><h3>担当者と予定日</h3><p>販売と修理のどちらでも、次に動く担当者と期限を共有します。</p></div></div>
    </div></section>
  </div>;
}

function MaintenanceBody() {
  const slots = [["09:00","車検入庫","受付内容と代車を確認","受付待ち"],["10:30","法定点検","作業項目と使用部品を更新","作業中"],["13:00","一般整備","追加作業の見積を顧客へ確認","承認待ち"],["16:30","納車","請求と次回点検時期を記録","納車予定"]] as const;
  return <div className={styles.routeBody}>
    <section className={styles.scheduleHero}><div className={styles.shell}>
      <p className={styles.eyebrow}>MAINTENANCE — 今日の入庫から見る</p><h1><span className={styles.headlineLine}>受付、作業、納車。</span><span className={styles.headlineLine}>一日の予定を、</span><span className={styles.headlineLine}>案件で追う。</span></h1>
      <p className={styles.heroLead}>整備工場で必要なのは抽象的な機能一覧ではなく、今日の入庫がどこまで進み、誰が次に動くかです。</p>
      <div className={styles.daySchedule}>{slots.map(([time,title,body,status]) => <article className={styles.slot} key={time}><time>{time}</time><strong>{title}</strong><p>{body}</p><span>{status}</span></article>)}</div>
    </div></section>
    <section className={styles.scheduleSection}><div className={styles.shell}>
      <div className={styles.sectionHeader}><h2>一つの案件に、次回期限まで残す</h2><p>目の前の作業が終わったあとも、請求と次回点検・車検の時期を顧客と車両へ残します。</p></div>
      <div className={styles.caseFlow}><article><span>01</span><h3>受付</h3><p>依頼内容、担当、代車、納車予定。</p></article><article><span>02</span><h3>作業</h3><p>進行状況、追加作業、使用部品。</p></article><article><span>03</span><h3>請求・納車</h3><p>金額、入金状況、納車日。</p></article><article><span>04</span><h3>次回案内</h3><p>点検・車検の満了日と案内時期。</p></article></div>
    </div></section>
  </div>;
}

function FaqBody() {
  return <div className={styles.routeBody}>
    <section className={styles.faqHero}><div className={styles.shell}><p className={styles.eyebrow}>FAQ — 店舗条件から確認</p><h1><span className={styles.headlineLine}>対象業種と無料範囲。</span><span className={styles.headlineLine}>権限と連携条件を、</span><span className={styles.headlineLine}>導入前に確認。</span></h1><p className={styles.heroLead}>機能ページへ戻らず、店舗の業態・台数・人数・連携条件から疑問を解決できます。</p></div></section>
    <section className={styles.faqSection}><div className={`${styles.shell} ${styles.faqLayout}`}>
      <nav className={styles.faqNav} aria-label="質問カテゴリ"><strong>質問カテゴリ</strong>{faqGroups.map(group => <a href={`#${group.id}`} key={group.id}>{group.title}</a>)}</nav>
      <div>{faqGroups.map(group => <section className={styles.faqGroup} id={group.id} key={group.id}><h2>{group.title}</h2>{group.items.map(([q,a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>)}</div>
    </div></section>
  </div>;
}

export function GarageRouteBody({ pageKey }: { pageKey: RouteKey }) {
  if (pageKey === "pricing") return <PricingBody />;
  if (pageKey === "industries/used-car") return <UsedCarBody />;
  if (pageKey === "industries/motorcycle") return <MotorcycleBody />;
  if (pageKey === "industries/maintenance") return <MaintenanceBody />;
  return <FaqBody />;
}
