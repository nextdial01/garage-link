import Link from "next/link";
import { productNames } from "@garage-link/config";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkLogo } from "@/components/LLinkLogo";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F3FBF6] px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-green-100 bg-white p-8 shadow-sm">
          <UiBadge tone="green">LINE外部ツールSaaS</UiBadge>
          <div className="mt-5">
            <LLinkLogo className="w-[170px] sm:w-[240px]" priority />
          </div>
          <h1 className="sr-only">{productNames.lLink}</h1>
          <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600">
            LINE公式アカウントの友だち管理、メッセージ配信、回答フォーム、リッチメニューを管理する単体パッケージです。
            現在は内部検証用の最小画面構成です。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700">
              ダッシュボードを開く
            </Link>
            <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
              設定を見る
            </Link>
          </div>
        </div>
        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <UiCard>
            <h2 className="text-lg font-black">LINE管理に集中</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">車両管理や商談管理の導線を持たない、LINE運用専用の画面構成です。</p>
          </UiCard>
          <UiCard>
            <h2 className="text-lg font-black">共通基盤を利用</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">UI、認証、DB型、課金ロジックはpackages配下で共有する前提です。</p>
          </UiCard>
          <UiCard>
            <h2 className="text-lg font-black">アップグレード対応</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">同じtenant_idのまま、将来GARAGE LINK機能を追加できる設計に寄せます。</p>
          </UiCard>
        </section>
      </div>
    </main>
  );
}
