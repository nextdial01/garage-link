import Link from "next/link";
import { LLinkLogo } from "./LLinkLogo";

const menuItems = [
  { label: "ダッシュボード", href: "/dashboard" },
  { label: "友だち管理", href: "/friends" },
  { label: "受信ログ", href: "/line/messages" },
  { label: "タグ管理", href: "/tags" },
  { label: "回答フォーム", href: "/forms" },
  { label: "リッチメニュー", href: "/rich-menus" },
  { label: "一斉配信", href: "/broadcasts" },
  { label: "セグメント", href: "/segments" },
  { label: "予約配信", href: "/line#scheduled" },
  { label: "ステップ配信", href: "/line#steps" },
  { label: "流入経路", href: "/line#routes" },
  { label: "分析", href: "/line#analytics" },
  { label: "LINE接続", href: "/settings/line" },
  { label: "会社・店舗設定", href: "/settings/organization" },
  { label: "メンバー", href: "/line#members" },
  { label: "権限", href: "/line#permissions" },
  { label: "料金プラン", href: "/billing" },
  { label: "問い合わせ管理", href: "/line#inquiries" },
];

export function LLinkShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F3FBF6] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-green-100 bg-white px-5 py-6 shadow-sm lg:block">
        <Link href="/" className="block w-fit" aria-label="L-Link ホーム">
          <LLinkLogo className="w-[200px]" priority />
        </Link>
        <p className="mt-1 text-xs font-bold text-slate-500">LINE外部ツールSaaS</p>
        <nav className="mt-8 max-h-[calc(100vh-9rem)] space-y-1 overflow-y-auto pr-1">
          {menuItems.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className="block rounded-xl px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-green-50 hover:text-green-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="lg:pl-64">
        <header className="border-b border-green-100 bg-white/90 px-5 py-5 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div>
              <LLinkLogo className="w-[150px] sm:w-[190px]" />
              <h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
            </div>
            <Link href="/settings" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700">
              設定
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-5 py-6">{children}</div>
      </main>
    </div>
  );
}
