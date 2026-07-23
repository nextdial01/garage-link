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
  /** GARAGE LINK 本番URL */
  serviceUrl: 'https://garage-link.tech/',
  /** コーポレートホームページ */
  corporateHomeUrl: 'https://kannagi-co.com/',
} as const;

/** 独立ドメイン方針（オーナー確定 2026-07-06。2026-07-11: 本番デプロイ完了・https到達確認済みのためhttps表記に更新） */
export const LEGAL_PRODUCT_DOMAINS = {
  corporate: 'https://kannagi-co.com/',
  garageLink: 'https://garage-link.tech/',
  lLink: 'https://llink.tech/',
  lTouring: 'https://l-touring.tech/',
} as const;

/** 月額料金（基準料金に10%相当額を加えた請求総額）。garagePlans.ts と整合 */
export const LEGAL_PLANS = [
  { name: 'Free', monthlyPrice: 0, note: '無料プラン' },
  { name: 'Starter', monthlyPrice: 7480, note: '月額サブスクリプション' },
  { name: 'Standard', monthlyPrice: 16280, note: '月額サブスクリプション' },
  { name: 'Pro', monthlyPrice: 32780, note: '月額サブスクリプション' },
] as const;

export const LEGAL_TAX_NOTE =
  '表示額は、基準料金に10%相当額を加えた請求総額です。当社は免税事業者であり、適格請求書は発行できません。';

/** B2B SaaS で一般的に列挙する委託先（利用状況に応じてリーガルチェックで確定） */
export const LEGAL_SUBPROCESSORS = [
  { name: 'Supabase Inc.', purpose: '認証・データベース・ファイルストレージ' },
  { name: 'Vercel Inc.', purpose: 'アプリケーションのホスティング' },
  { name: 'Stripe, Inc.', purpose: '決済処理（導入後）' },
] as const;

export const LEGAL_LAST_UPDATED = '2026年7月23日';
