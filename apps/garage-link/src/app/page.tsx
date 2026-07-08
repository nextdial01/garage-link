import type { Metadata } from 'next';
import Link from 'next/link';
import { GARAGE_PLANS } from '@/lib/billing/garagePlans';

export const metadata: Metadata = {
  title: 'GARAGE LINK | 中古車・バイク販売店向け業務管理SaaS',
  description:
    '在庫管理・商談・見積・請求・LINE連携まで。中古車・バイク販売店・整備工場向けの GARAGE LINK。',
};

const planCards = [
  GARAGE_PLANS.free,
  GARAGE_PLANS.starter,
  GARAGE_PLANS.standard,
  GARAGE_PLANS.pro,
];

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GARAGE LINK',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    '中古車・バイク販売店・整備工場向けの業務管理SaaS。在庫管理・商談・見積書・請求書発行・整備部品管理・LINE連携をクラウドで一元化する。',
  url: 'https://garage-link.tech/',
  provider: { '@type': 'Organization', name: '株式会社かんなぎ', url: 'https://garage-link.tech/' },
  offers: planCards.map((plan) => ({
    '@type': 'Offer',
    name: plan.name,
    price: plan.monthlyPrice,
    priceCurrency: 'JPY',
    url: 'https://garage-link.tech/signup',
  })),
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          中古車・バイク販売店 / 整備工場向け
        </div>
        <p className="mb-4 text-sm font-bold tracking-[0.3em] text-blue-600">GARAGE LINK</p>
        <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl">
          在庫から見積・請求まで、
          <br />
          店舗業務をひとつに
        </h1>
        <p className="mb-10 max-w-2xl text-lg leading-8 text-slate-600">
          車両在庫、顧客・商談、見積書・請求書、整備・部品管理をクラウドで一元化。
          Freeプランから無料で始められます。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-xl bg-blue-600 px-8 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            無料で使う
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-slate-300 px-8 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            ログイン
          </Link>
        </div>
      </section>

      <section className="border-t px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">こんな課題はありませんか。</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold">在庫が紙・Excelで管理されている</h3>
              <p className="mt-2 text-sm text-slate-600">
                車両情報がバラバラで、在庫台数や状態確認に時間がかかる。
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold">見積・請求の作成に手間がかかる</h3>
              <p className="mt-2 text-sm text-slate-600">
                商談ごとに手作業で見積書・請求書を作成し、抜け漏れが起きやすい。
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold">整備・部品の履歴が追えない</h3>
              <p className="mt-2 text-sm text-slate-600">
                車検・整備の記録や部品在庫が分散し、次回対応の判断が難しい。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="border-t bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">主要機能</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['車両在庫管理', '入庫から販売まで、車両情報を一元管理'],
              ['顧客・商談管理', '見込み客から成約までの商談履歴を記録'],
              ['見積・請求', 'ワンクリックで見積書・請求書を発行'],
              ['整備・部品管理', '車検・整備履歴と部品在庫を紐づけて管理'],
              ['棚卸し', '定期棚卸しをアプリ上で完結'],
              ['L-LINK連携', 'Standard プラン以上で公式LINE集客と連動'],
            ].map(([title, desc]) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-bold">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">料金プラン</h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            まずは Free で試せます。アップグレードはアプリ内から申込可能です。
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {planCards.map((plan) => (
              <article
                key={plan.code}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="mt-2 text-2xl font-black text-blue-600">
                  {plan.monthlyPrice === 0 ? '無料' : `¥${plan.monthlyPrice.toLocaleString()}`}
                  {plan.monthlyPrice > 0 && <span className="text-sm font-bold text-slate-500">/月</span>}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li>在庫 {plan.inventoryLimit}台まで</li>
                  <li>スタッフ {plan.includedStaffCount}名〜</li>
                  {plan.lLinkIntegrationEnabled && <li>L-LINK連携</li>}
                </ul>
              </article>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            決済連携（Stripe）は準備中です。現時点ではアプリ内申込 → 手動反映で有料プラン開始できます。
          </p>
        </div>
      </section>

      <footer className="border-t px-6 py-8 text-center text-sm text-slate-500">
        <Link href="/legal/terms" className="hover:text-blue-600">
          利用規約
        </Link>
        <span className="mx-2">·</span>
        <Link href="/legal/privacy" className="hover:text-blue-600">
          プライバシーポリシー
        </Link>
        <span className="mx-2">·</span>
        <Link href="/legal/tokusho" className="hover:text-blue-600">
          特定商取引法に基づく表記
        </Link>
      </footer>
    </main>
  );
}
