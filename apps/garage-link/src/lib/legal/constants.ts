/**
 * GARAGE LINK 法務ページ共通定数
 */

/** リーガルチェック時に確定する事業者情報 */
export const LEGAL_SELLER = {
  legalName: '株式会社かんなぎ',
  serviceName: 'GARAGE LINK',
  representative: '大久保圭祐',
  address: '大阪府枚方市星丘4-30-6',
  /** 特商法表記用。お問い合わせは原則メール優先 */
  phone: '070-2421-6759',
  email: 'info@kannagi-co.com',
  /** 任意。サポート窓口として特商法表記に併記可（単独連絡先にはしない） */
  lineOfficialUrl: '',
  /** GARAGE LINK 本番URL（独立ドメイン・DNS設定後に有効化） */
  serviceUrl: 'http://garage-link.tech/',
  /** コーポレートホームページ */
  corporateHomeUrl: 'http://kannagi-co.com/',
} as const;

/** 独立ドメイン方針（オーナー確定 2026-07-06）— http表記 */
export const LEGAL_PRODUCT_DOMAINS = {
  corporate: 'http://kannagi-co.com/',
  garageLink: 'http://garage-link.tech/',
  lLink: 'http://llink.tech/',
  lTouring: 'http://l-touring.tech/',
} as const;

/** 料金（税抜）。garagePlans.ts と整合 */
export const LEGAL_PLANS = [
  { name: 'Free', monthlyPriceExTax: 0, note: '無料プラン' },
  { name: 'Starter', monthlyPriceExTax: 6800, note: '月額サブスクリプション' },
  { name: 'Standard', monthlyPriceExTax: 14800, note: '月額サブスクリプション' },
  { name: 'Pro', monthlyPriceExTax: 29800, note: '月額サブスクリプション' },
] as const;

export const LEGAL_TAX_NOTE = '表示価格は税抜です。消費税は別途請求します。';

/** B2B SaaS で一般的に列挙する委託先（利用状況に応じてリーガルチェックで確定） */
export const LEGAL_SUBPROCESSORS = [
  { name: 'Supabase Inc.', purpose: '認証・データベース・ファイルストレージ' },
  { name: 'Vercel Inc.', purpose: 'アプリケーションのホスティング' },
  { name: 'Stripe, Inc.', purpose: '決済処理（導入後）' },
] as const;

export const LEGAL_LAST_UPDATED = '2026年7月6日';
