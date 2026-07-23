import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./public-site.module.css";
import screenStyles from "./product-screens.module.css";
import headerStyles from "./header-cta.module.css";
import conversionStyles from "./conversion-section.module.css";
import refreshStyles from "./brand-hero-refresh.module.css";
import { GarageRouteBody } from "./GarageRouteBody";

export type GaragePublicPageKey =
  | "features"
  | "pricing"
  | "industries/used-car"
  | "industries/motorcycle"
  | "industries/maintenance"
  | "faq";

type PageItem = { title: string; body: string };

type PageSection = {
  title: string;
  description: string;
  items: PageItem[];
};

type HeroCopy = {
  eyebrow: string;
  title: readonly string[];
  lead: string;
};

type ProcessCopy = {
  kicker: string;
  title: string;
  lead: string;
  steps: PageItem[];
};

const faqs = [
  {
    question: "中古車販売店以外でも使えますか？",
    answer: "はい。バイク販売・修理店、整備工場、車検を扱う店舗でも利用できます。業態に合わせて、在庫、商談、整備、見積・請求など必要な機能から使い始められます。",
  },
  {
    question: "無料で試せる範囲を教えてください。",
    answer: "Freeプランは月額0円で、在庫5台、スタッフ1人、1店舗、見積・請求は月5件まで利用できます。登録時に決済情報の入力はありません。",
  },
  {
    question: "スタッフごとに見られる情報を分けられますか？",
    answer: "はい。店舗内の役割に応じて、閲覧や操作の範囲を分けられます。導入前に、現在の担当範囲と承認が必要な業務をご確認ください。",
  },
  {
    question: "L-LINKとの連携は、どのプランで使えますか？",
    answer: "L-LINK連携はStandardプランとProプランで利用できます。LINE側の設計・構築支援が必要な場合は、L-touringをご案内します。",
  },
];

const pages: Record<GaragePublicPageKey, { title: string; description: string; sections: PageSection[] }> = {
  features: {
    title: "GARAGE LINKの機能",
    description: "中古車販売店、バイク販売・修理店、整備工場の車両、顧客、商談、整備、見積・請求を店舗全体で確認できる管理ツールです。",
    sections: [
      {
        title: "車両を起点に、販売と整備の情報をつなぐ",
        description: "担当者ごとのメモや別々の表計算ファイルを探さず、今日の対応と店舗の数字を同じ情報から確認します。",
        items: [
          { title: "車両在庫", body: "仕入、原価、在庫日数、販売状態、媒体掲載状況を車両ごとに確認します。" },
          { title: "顧客・商談", body: "問い合わせ、希望条件、対象車両、見積、次回連絡を一つの商談として記録します。" },
          { title: "見積・請求", body: "車両、整備、部品、諸費用の明細を使い、見積から請求へ引き継ぎます。" },
          { title: "整備・車検", body: "入庫、作業内容、使用部品、担当、納車予定、次回車検を確認します。" },
          { title: "来店・試乗予約", body: "日時、担当者、対象車両、来店状況を一覧で確認し、当日の対応へつなげます。" },
          { title: "今日やること", body: "来店、次回連絡、整備期限、長期在庫など、期限が近い仕事を優先して表示します。" },
        ],
      },
    ],
  },
  pricing: {
    title: "GARAGE LINKの料金",
    description: "在庫台数、スタッフ数、店舗数、L-LINK連携の有無に合わせて、月額0円のFreeを含む4プランから選べます。有料プランの表示額は基準料金に10%相当額を加えた請求総額です。当社は免税事業者であり、適格請求書は発行できません。",
    sections: [
      {
        title: "店舗規模に合わせた4プラン",
        description: "在庫5台まで試せるFreeから、複数店舗で使えるProまで段階的に変更できます。",
        items: [
          { title: "Free｜月額0円", body: "在庫5台、スタッフ1人、1店舗。見積・請求は月5件まで利用できます。" },
          { title: "Starter｜月額7,480円", body: "在庫50台、スタッフ1人、1店舗。見積・請求は月20件まで利用できます。" },
          { title: "Standard｜月額16,280円", body: "在庫200台、スタッフ3人、1店舗。見積・請求は上限なしで、L-LINK連携に対応します。" },
          { title: "Pro｜月額32,780円", body: "在庫500台、スタッフ10人、3店舗。見積・請求は上限なしで、L-LINK連携に対応します。" },
        ],
      },
      {
        title: "追加が必要になったときの料金",
        description: "スタッフや店舗を増やす場合と、個別支援を依頼する場合の費用です。",
        items: [
          { title: "追加スタッフ｜月額1,100円／人", body: "追加できる対象プランで、店舗の運用人数に合わせて増やせます。" },
          { title: "追加店舗｜月額5,500円／店舗", body: "Standard・Proで、契約に含まれる店舗数を超える場合に追加できます。" },
          { title: "個別サポート｜60分11,000円", body: "画面を共有した個別支援の料金です。通常のチャットサポートは各プランに含まれます。" },
        ],
      },
    ],
  },
  "industries/used-car": {
    title: "中古車販売店向け管理システム",
    description: "仕入から掲載、問い合わせ、商談、見積、請求、納車後の案内までを、対象車両を起点に確認できます。",
    sections: [
      {
        title: "在庫日数と、商談の次回予定を同じ車両で確認",
        description: "売れていない車両だけでなく、問い合わせが止まっている商談も早めに見つけます。",
        items: [
          { title: "仕入原価と在庫日数", body: "仕入日、入庫日、原価、保管場所を記録し、長期在庫を一覧で確認します。" },
          { title: "媒体掲載と参考相場", body: "掲載先、掲載状態、参考相場の出所・確認日・条件を車両へ残します。" },
          { title: "問い合わせと商談", body: "希望車両、来店予定、見積、次回連絡日を顧客と車両にひも付けます。" },
          { title: "納車後の次回案内", body: "納車日と次回点検時期を記録し、L-LINK連携時はLINE案内の対象へつなげます。" },
        ],
      },
    ],
  },
  "industries/motorcycle": {
    title: "バイク販売・修理店向け管理システム",
    description: "販売車両、修理・カスタム入庫、部品、見積、納車予定を、担当者と期限が分かる形で共有します。",
    sections: [
      {
        title: "販売車両と修理入庫を、別々の台帳にしない",
        description: "販売と修理が同時に進む店舗でも、対象車両、担当、次の作業を一つの画面から確認します。",
        items: [
          { title: "販売車両の在庫", body: "メーカー、車種、仕入、販売状態、保管場所を車両ごとに確認します。" },
          { title: "修理・カスタム入庫", body: "依頼内容、作業状態、使用部品、担当者、納車予定を記録します。" },
          { title: "見積と追加作業", body: "当初見積と追加作業を明細で分け、説明した内容と金額を残します。" },
          { title: "点検・季節案内", body: "次回点検を記録し、L-LINK連携時は時期に合わせたLINE案内へつなげます。" },
        ],
      },
    ],
  },
  "industries/maintenance": {
    title: "整備工場・車検工場向け管理システム",
    description: "予約、入庫、作業、部品、見積、請求、納車、次回車検までを、受付と整備の両方から確認できます。",
    sections: [
      {
        title: "今日の入庫と、次回車検の期限を一続きに",
        description: "目の前の作業予定と、将来の案内時期を同じ顧客・車両情報から確認します。",
        items: [
          { title: "予約・入庫予定", body: "受付日時、依頼内容、担当者、代車、納車予定を一覧で確認します。" },
          { title: "作業内容と使用部品", body: "作業状態、部品、数量、工賃を整備記録と見積・請求へ反映します。" },
          { title: "納車と請求", body: "完了した作業、請求金額、入金状況、納車日を同じ案件で確認します。" },
          { title: "車検・点検の次回案内", body: "満了日と案内時期を記録し、L-LINK連携時はLINE案内の対象へつなげます。" },
        ],
      },
    ],
  },
  faq: {
    title: "GARAGE LINKのよくある質問",
    description: "対象業種、無料で使える範囲、スタッフ権限、L-LINK連携について、登録前に確認したい条件をまとめました。",
    sections: [
      {
        title: "登録前に確認したいこと",
        description: "できることだけでなく、プランや運用人数によって変わる条件も掲載しています。",
        items: faqs.map(({ question, answer }) => ({ title: question, body: answer })),
      },
    ],
  },
};

const heroCopy: Record<GaragePublicPageKey, HeroCopy> = {
  features: {
    eyebrow: "車屋・バイク屋の店舗管理",
    title: ["在庫・商談・整備を、", "一画面で確認。"],
    lead: "車両、顧客、商談、整備、見積・請求を同じ店舗台帳へ。担当者と期限を共有し、次に動く仕事から確認できます。",
  },
  pricing: {
    eyebrow: "月額0円から、店舗規模に合わせて",
    title: ["台数と人数で選ぶ。", "月額0円から", "4つのプラン。"],
    lead: "在庫5台までのFreeから、L-LINK連携や複数店舗に対応するStandard・Proまで。現在の運用規模に合わせて選べます。",
  },
  "industries/used-car": {
    eyebrow: "中古車販売店向け",
    title: ["在庫日数と商談予定。", "同じ車両で確認。"],
    lead: "仕入原価、掲載状態、問い合わせ、見積、次回連絡、納車予定を車両へひも付け、売れ残りと追客漏れを見つけます。",
  },
  "industries/motorcycle": {
    eyebrow: "バイク販売・修理店向け",
    title: ["販売車両と修理入庫。", "一つの台帳に。"],
    lead: "在庫、修理依頼、使用部品、追加作業、納車予定を店舗で共有。販売と整備が並行しても、担当と次の作業を確認できます。",
  },
  "industries/maintenance": {
    eyebrow: "整備工場・車検工場向け",
    title: ["今日の入庫と", "次回車検を、", "一つの案件で確認。"],
    lead: "予約、作業、部品、見積・請求、納車を同じ案件で確認。次回点検や車検の案内時期まで顧客・車両へ残せます。",
  },
  faq: {
    eyebrow: "導入前に確認したいこと",
    title: ["対象業種・無料範囲。", "権限と連携条件を", "登録前に確認。"],
    lead: "登録後に想定と違わないよう、店舗の業態と人数、在庫台数、L-LINK連携の条件を具体的にまとめました。",
  },
};

const facts: Record<GaragePublicPageKey, Array<{ value: string; label: string }>> = {
  features: [
    { value: "3業態", label: "中古車・バイク・整備" },
    { value: "一つの台帳", label: "車両・顧客・商談・整備" },
    { value: "月額0円から", label: "在庫5台まで試用" },
  ],
  pricing: [
    { value: "0円", label: "Freeプランの月額" },
    { value: "4プラン", label: "FreeからProまで" },
    { value: "請求総額", label: "10%相当額を含む月額料金" },
  ],
  "industries/used-car": [
    { value: "仕入〜納車", label: "車両単位で確認" },
    { value: "在庫日数", label: "長期在庫を把握" },
    { value: "次回連絡", label: "商談ごとに記録" },
  ],
  "industries/motorcycle": [
    { value: "販売＋修理", label: "同じ店舗台帳で管理" },
    { value: "部品・工賃", label: "追加作業も明細化" },
    { value: "納車予定", label: "担当と期限を共有" },
  ],
  "industries/maintenance": [
    { value: "予約〜納車", label: "案件ごとに確認" },
    { value: "作業・部品", label: "見積・請求へ反映" },
    { value: "次回車検", label: "案内時期を記録" },
  ],
  faq: [
    { value: "3業態", label: "中古車・バイク・整備" },
    { value: "月額0円", label: "Freeプラン" },
    { value: "Standard以上", label: "L-LINK連携" },
  ],
};

const processCopy: Record<GaragePublicPageKey, ProcessCopy> = {
  features: {
    kicker: "導入の始め方",
    title: "一番よく見る台帳から、段階的に移す",
    lead: "全機能を一度に設定せず、在庫や今日の予約など、確認頻度が高い情報から始めます。",
    steps: [
      { title: "現在の台帳を確認", body: "車両、顧客、商談、整備、見積・請求をどこで管理しているか確認します。" },
      { title: "優先する情報を登録", body: "在庫や予約など、今日の業務に必要な情報から登録します。" },
      { title: "担当と権限を決める", body: "誰が見るか、誰が更新するかを決め、店舗内で操作を確認します。" },
    ],
  },
  pricing: {
    kicker: "プランの選び方",
    title: "在庫台数、利用人数、店舗数の順に確認する",
    lead: "現在値だけでなく、半年後に増える台数とスタッフ数も含めて比較してください。",
    steps: [
      { title: "管理する在庫台数を確認", body: "販売前、商談中、整備中を含め、登録する車両台数を確認します。" },
      { title: "利用するスタッフ数を確認", body: "閲覧だけの担当者も含め、店舗で利用する人数を数えます。" },
      { title: "連携と店舗数を確認", body: "L-LINK連携の要否と、管理する店舗数から対象プランを絞ります。" },
    ],
  },
  "industries/used-car": {
    kicker: "最初の登録",
    title: "販売中の車両と、進行中の商談から始める",
    lead: "過去データをすべて移す前に、今日確認したい在庫と商談で操作を試します。",
    steps: [
      { title: "販売中の車両を登録", body: "仕入、原価、販売価格、掲載状態を登録します。" },
      { title: "進行中の商談をひも付ける", body: "顧客、希望車両、見積、次回連絡日を登録します。" },
      { title: "在庫と追客を毎日確認", body: "長期在庫と連絡期限が近い商談を同じ手順で確認します。" },
    ],
  },
  "industries/motorcycle": {
    kicker: "最初の登録",
    title: "販売車両と修理入庫を、担当別に試す",
    lead: "販売担当と整備担当が同じ車両情報を確認できる運用から始めます。",
    steps: [
      { title: "販売車両を登録", body: "仕入、販売状態、保管場所を登録します。" },
      { title: "修理入庫を登録", body: "依頼内容、担当者、部品、納車予定を登録します。" },
      { title: "追加作業を明細へ反映", body: "説明した内容と金額を残し、見積・請求へ引き継ぎます。" },
    ],
  },
  "industries/maintenance": {
    kicker: "最初の登録",
    title: "今日の入庫予定と、作業中の案件から始める",
    lead: "受付と整備の担当者が、同じ案件で予定・作業・納車を確認できる状態を作ります。",
    steps: [
      { title: "本日の予約を登録", body: "入庫時刻、依頼内容、担当、代車、納車予定を確認します。" },
      { title: "作業と部品を更新", body: "進行状況、追加作業、使用部品を案件へ記録します。" },
      { title: "請求と次回期限を残す", body: "納車後に、請求情報と次回点検・車検時期を記録します。" },
    ],
  },
  faq: {
    kicker: "確認の順番",
    title: "台数、人数、連携条件を確認してから登録する",
    lead: "Freeの上限と、店舗で共有する情報を先に確認すると、導入後の認識差を減らせます。",
    steps: [
      { title: "対象業務を決める", body: "在庫、商談、整備、見積・請求のうち、最初に使う業務を決めます。" },
      { title: "プラン上限を確認", body: "在庫台数、スタッフ数、店舗数、見積・請求件数を確認します。" },
      { title: "権限と連携を確認", body: "スタッフの担当範囲と、L-LINK連携の要否を決めます。" },
    ],
  },
};

const finalCopy: Record<GaragePublicPageKey, { eyebrow: string; title: string; secondary: string; secondaryHref: string }> = {
  features: { eyebrow: "実際の店舗画面で、台帳の見え方を確認できます。", title: "在庫5台まで、実際の操作を無料で試す。", secondary: "料金を比べる", secondaryHref: "/pricing" },
  pricing: { eyebrow: "Freeプランは月額0円。登録時にカード情報は不要です。", title: "今の台数と人数で、Freeプランを試す。", secondary: "機能を見る", secondaryHref: "/features" },
  "industries/used-car": { eyebrow: "販売中の車両と、進行中の商談から始められます。", title: "在庫と追客を、一つの画面で試す。", secondary: "料金を比べる", secondaryHref: "/pricing" },
  "industries/motorcycle": { eyebrow: "販売と修理を、同じ店舗台帳で試せます。", title: "販売と修理の共有を、在庫5台まで試す。", secondary: "料金を比べる", secondaryHref: "/pricing" },
  "industries/maintenance": { eyebrow: "予約、作業、納車、次回期限を一続きで確認できます。", title: "今日の入庫予定から、店舗運用を試す。", secondary: "料金を比べる", secondaryHref: "/pricing" },
  faq: { eyebrow: "利用条件を確認したら、Freeで実際の操作を試せます。", title: "台数と人数に合うか、Freeプランで試す。", secondary: "料金を比べる", secondaryHref: "/pricing" },
};

const navigation = [
  { href: "/features", label: "機能" },
  { href: "/pricing", label: "料金" },
  { href: "/industries/used-car", label: "中古車販売" },
  { href: "/industries/motorcycle", label: "バイク店" },
  { href: "/industries/maintenance", label: "整備工場" },
  { href: "/faq", label: "FAQ" },
] as const;

const productScreens = [
  {
    src: "/product-screens/appointments.png",
    title: "来店・試乗予約と当日の対応を確認",
    description: "予約日時、担当、対象車両、来店状況を一覧で確認し、対応漏れを見つけます。",
    alt: "GARAGE LINKの来店・試乗予約画面",
  },
  {
    src: "/product-screens/vehicle-entry.png",
    title: "車両情報を店舗で共有",
    description: "車両情報、仕入・販売価格、古物情報を、販売と整備で共通利用できる形で登録します。",
    alt: "GARAGE LINKの車両登録画面",
  },
  {
    src: "/product-screens/analytics.png",
    title: "在庫・顧客・商談を数字で確認",
    description: "店舗内の登録データを集計し、在庫台数や未対応件数など、確認が必要な項目を表示します。",
    alt: "GARAGE LINKの分析画面",
  },
] as const;

const heroVisuals: Record<GaragePublicPageKey, { title: string; subtitle: string }> = {
  features: { title: "今日の予約と対応状況", subtitle: "期限が近い仕事から確認する" },
  pricing: { title: "店舗データを同じ画面で集計", subtitle: "規模に合うプランをFreeから確認" },
  "industries/used-car": { title: "仕入・原価・販売状態を登録", subtitle: "車両を中心に在庫と商談をつなぐ" },
  "industries/motorcycle": { title: "販売車両と修理情報を共有", subtitle: "担当と納期を店舗で確認" },
  "industries/maintenance": { title: "入庫・作業・納車予定を確認", subtitle: "受付と整備の情報を一つの案件に" },
  faq: { title: "店舗データの見え方を確認", subtitle: "料金・権限・連携条件を登録前に確認" },
};

const heroScreenIndex: Record<GaragePublicPageKey, number> = {
  features: 0,
  pricing: 2,
  "industries/used-car": 1,
  "industries/motorcycle": 1,
  "industries/maintenance": 0,
  faq: 2,
};

export function buildGaragePublicMetadata(key: GaragePublicPageKey): Metadata {
  const page = pages[key];
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${key}` },
    openGraph: { title: `${page.title} | GARAGE LINK`, description: page.description, url: `/${key}` },
  };
}

export function GaragePublicPage({ pageKey }: { pageKey: GaragePublicPageKey }) {
  const page = pages[pageKey];
  const hero = heroCopy[pageKey];
  const pageFacts = facts[pageKey];
  const process = processCopy[pageKey];
  const final = finalCopy[pageKey];
  const heroVisual = heroVisuals[pageKey];
  const heroScreen = productScreens[heroScreenIndex[pageKey]];
  const isFeaturesPage = pageKey === "features";
  const isFaqPage = pageKey === "faq";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: page.title,
        description: page.description,
        url: `https://garage-link.tech/${pageKey}`,
        isPartOf: { "@type": "WebSite", name: "GARAGE LINK", url: "https://garage-link.tech/" },
        dateModified: "2026-07-18",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "GARAGE LINK", item: "https://garage-link.tech/" },
          { "@type": "ListItem", position: 2, name: page.title, item: `https://garage-link.tech/${pageKey}` },
        ],
      },
      ...(isFaqPage ? [{
        "@type": "FAQPage",
        mainEntity: faqs.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }] : []),
    ],
  };

  return (
    <main className={styles.page} data-page={pageKey}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className={styles.header}>
        <div className={`${styles.headerInner} ${refreshStyles.headerInner}`}>
          <Link className={`${styles.brand} ${refreshStyles.brand}`} href="/" aria-label="GARAGE LINK ホーム">
            <Image className={refreshStyles.brandImage} src="/branding/garage-link-logo.png" width={1058} height={444} alt="GARAGE LINK" priority />
          </Link>
          <nav className={`${styles.nav} ${refreshStyles.desktopNav}`} aria-label="公開ページ">
            {navigation.map((item) => <Link aria-current={item.href === `/${pageKey}` ? "page" : undefined} key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
          <Link className={`${styles.login} ${refreshStyles.desktopLogin}`} href="/login">ログイン</Link>
          <Link className={`${headerStyles.headerCta} ${refreshStyles.mobileCta}`} href="/signup">無料で始める</Link>
          <details className={refreshStyles.mobileMenu}>
            <summary aria-label="メニュー"><span aria-hidden="true">☰</span></summary>
            <nav aria-label="スマホ用公開ページ">
              {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
              <Link href="/login">ログイン</Link>
            </nav>
          </details>
        </div>
      </header>

      {pageKey === "features" ? <>
      <section className={styles.hero}>
        <span className={styles.heroArc} aria-hidden="true" />
        <span className={styles.heroBeam} aria-hidden="true" />
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{hero.eyebrow}</p>
            <h1>{hero.title.map((line) => <span className={styles.headlineLine} key={line}>{line}</span>)}</h1>
            <p className={styles.lead}>{hero.lead}</p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/signup">無料アカウントを作る <span aria-hidden="true">→</span></Link>
              <Link className={styles.secondary} href={isFeaturesPage ? "#product-screens" : "/features#product-screens"}>実際の画面を見る</Link>
            </div>
            <p className={styles.microcopy}>Freeプランは月額0円。登録時に決済情報の入力はありません。</p>
          </div>
          <figure className={refreshStyles.productPreview} aria-label="GARAGE LINKの実際の管理画面">
            <div className={refreshStyles.previewHeading}>
              <span>実際の管理画面</span>
              <strong>{heroVisual.title}</strong>
            </div>
            <div className={refreshStyles.previewImage}>
              <Image src={heroScreen.src} width={1015} height={650} alt={heroScreen.alt} priority loading="eager" sizes="(max-width: 960px) 100vw, 480px" unoptimized />
            </div>
            <figcaption>{heroVisual.subtitle}</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.facts} aria-label="このページの要点">
        <div className={styles.container}>
          {pageFacts.map((fact) => <div key={fact.value}><strong>{fact.value}</strong><span>{fact.label}</span></div>)}
        </div>
      </section>

      {isFeaturesPage && (
        <section className={conversionStyles.section} aria-labelledby="garage-outcomes-heading">
          <div className={styles.container}>
            <div className={conversionStyles.heading}>
              <p>FROM RECORD TO ACTION</p>
              <h2 id="garage-outcomes-heading">探す台帳から、今日動くための店舗情報へ。</h2>
            </div>
            <div className={conversionStyles.grid}>
              <article><span>車両・顧客・商談が別々</span><b aria-hidden="true">→</b><strong>対象車両から履歴を確認</strong><p>問い合わせ、商談、見積、請求、納車を車両と顧客へひも付けます。</p></article>
              <article><span>担当者しか状況を知らない</span><b aria-hidden="true">→</b><strong>担当と期限を店舗で共有</strong><p>役割に応じた権限で、次の対応と更新内容を確認できます。</p></article>
              <article><span>期限を複数の台帳から探す</span><b aria-hidden="true">→</b><strong>今日やる仕事から確認</strong><p>来店、次回連絡、整備期限、長期在庫を優先順に表示します。</p></article>
            </div>
          </div>
        </section>
      )}

      {isFeaturesPage && (
        <section className={screenStyles.section} id="product-screens">
          <div className={styles.container}>
            <div className={screenStyles.heading}>
              <p className={screenStyles.kicker}>PRODUCT SCREENS</p>
              <h2>店舗で使う画面を、導入前に確認できます。</h2>
              <p>機能一覧だけでは分からない、情報の見え方と日々の操作を実際の画面で確かめてください。</p>
            </div>
            <div className={screenStyles.showcase}>
              {productScreens.map((screen, index) => (
                <figure className={index === 0 ? screenStyles.featured : screenStyles.screenCard} key={screen.src}>
                  <div className={screenStyles.imageFrame}>
                    <a className={screenStyles.imageLink} href={screen.src} target="_blank" rel="noreferrer" aria-label={`${screen.title}の画像を拡大表示`}>
                      <Image src={screen.src} width={1015} height={650} alt={screen.alt} sizes={index === 0 ? "(max-width: 760px) 100vw, 1015px" : "(max-width: 760px) 100vw, 540px"} unoptimized />
                    </a>
                  </div>
                  <figcaption><strong>{screen.title}</strong><span>{screen.description}</span></figcaption>
                </figure>
              ))}
            </div>
            <div className={screenStyles.trust} aria-label="登録前に確認できること">
              <div><span>01</span><strong>料金と利用上限を公開</strong><p>在庫台数、人数、店舗数を登録前に比較できます。</p></div>
              <div><span>02</span><strong>Freeはカード登録不要</strong><p>在庫5台まで、実際の画面と操作を試せます。</p></div>
              <div><span>03</span><strong>運営会社を明記</strong><p>株式会社かんなぎが開発・運営しています。</p></div>
            </div>
          </div>
        </section>
      )}

      {page.sections.map((section, sectionIndex) => (
        <section className={styles.section} id={sectionIndex === 0 ? "page-details" : undefined} key={section.title}>
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIndex}>{String(sectionIndex + 1).padStart(2, "0")}</span>
              <div><h2>{section.title}</h2><p>{section.description}</p></div>
            </div>
            {isFaqPage ? (
              <div className={styles.faqList}>
                {section.items.map((item) => (
                  <details key={item.title}>
                    <summary>{item.title}<span aria-hidden="true">＋</span></summary>
                    <p>{item.body}</p>
                  </details>
                ))}
              </div>
            ) : (
              <div className={styles.grid}>
                {section.items.map((item, index) => (
                  <article className={styles.card} key={item.title}>
                    <span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}

      <section className={styles.process}>
        <div className={styles.container}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionIndex}>NEXT</span>
            <div><p className={styles.kicker}>{process.kicker}</p><h2>{process.title}</h2><p>{process.lead}</p></div>
          </div>
          <ol className={styles.steps}>
            {process.steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}
          </ol>
        </div>
      </section>
      </> : <GarageRouteBody pageKey={pageKey} />}

      <aside className={styles.related} aria-label="LINE関連サービス">
        <div className={styles.container}>
          <span className={styles.relatedLabel}>KANNAGI SERVICES</span>
          <h2>LINEでの受付や再案内までつなげる場合</h2>
          <p>LINE公式アカウントの運用は <a href="https://llink.tech/">L-LINK</a>、車・バイク業界向けのLINE設計・初期構築は <a href="https://l-touring.tech/">L-touring</a> が担当します。</p>
        </div>
      </aside>

      <section className={styles.finalCta}>
        <span className={styles.ctaArc} aria-hidden="true" />
        <div className={styles.container}>
          <p>{final.eyebrow}</p>
          <h2>{final.title}</h2>
          <div className={styles.actions}><Link className={styles.primary} href="/signup">無料アカウントを作る <span aria-hidden="true">→</span></Link><Link className={styles.ctaText} href={final.secondaryHref}>{final.secondary}</Link></div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Image src="/branding/garage-link-logo.png" width={144} height={61} alt="GARAGE LINK" />
        <span>© 株式会社かんなぎ　最終更新: 2026年7月18日</span>
        <nav className={conversionStyles.footerLinks} aria-label="法務情報"><Link href="/legal/terms">利用規約</Link><Link href="/legal/privacy">プライバシー</Link><Link href="/legal/tokusho">特商法表記</Link></nav>
      </footer>
    </main>
  );
}
