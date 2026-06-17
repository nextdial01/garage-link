import Link from "next/link";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";

type Feature = {
  id: string;
  title: string;
  description: string;
  href?: string;
};

const features: Feature[] = [
  { id: "friends", title: "友だち管理", description: "表示名、状態、タグ、最終反応を管理します。", href: "/friends" },
  { id: "tags", title: "タグ管理", description: "タグ作成、編集、友だちへの付与を管理します。", href: "/tags" },
  { id: "messages", title: "一斉配信", description: "下書き、テスト配信、配信前確認、本配信を扱います。" },
  { id: "segments", title: "セグメント", description: "タグ、フォーム回答、友だち属性で対象を管理します。" },
  { id: "scheduled", title: "予約配信", description: "指定日時の配信予約を管理します。" },
  { id: "scenarios", title: "シナリオ配信", description: "ステップ配信と自動分岐の受け皿です。" },
  { id: "steps", title: "ステップ配信", description: "日数や条件に応じた追客メッセージを管理します。" },
  { id: "forms", title: "回答フォーム", description: "フォーム作成と回答管理の受け皿です。" },
  { id: "rich-menus", title: "リッチメニュー", description: "リッチメニュー作成・切替の受け皿です。" },
  { id: "routes", title: "流入経路", description: "QR、広告、店頭などの流入経路を分析します。" },
  { id: "inquiries", title: "問い合わせ管理", description: "LINE経由の問い合わせを管理します。" },
  { id: "analytics", title: "分析", description: "友だち増加、配信、フォーム回答の状況を確認します。" },
  { id: "members", title: "メンバー", description: "スタッフ管理の受け皿です。" },
  { id: "permissions", title: "権限", description: "owner/admin/staff/viewerの操作範囲を管理します。" },
];

export default function LLinkLinePage() {
  return (
    <LLinkShell title="LINE管理" description="L-Linkの本体機能を管理するための受け皿ページです。">
      <div className="space-y-6">
        <UiCard>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <UiBadge tone="green">L-Link本体機能</UiBadge>
              <h2 className="mt-3 text-2xl font-black text-slate-950">LINE運用機能はL-Link側で管理します</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                GARAGE LINKからはL-Link連携可否と契約状態だけを確認し、配信・シナリオ・フォーム・リッチメニューなどの操作はこのL-Linkアプリへ集約します。
              </p>
            </div>
            <Link href="/settings" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700">
              LINE設定へ
            </Link>
          </div>
        </UiCard>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <UiCard key={feature.id} className="p-5" >
              <div id={feature.id} className="scroll-mt-24">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-slate-950">{feature.title}</h3>
                  <UiBadge tone="slate">準備中</UiBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                {feature.href ? (
                  <Link href={feature.href} className="mt-4 inline-flex rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700">
                    開く
                  </Link>
                ) : null}
              </div>
            </UiCard>
          ))}
        </section>
      </div>
    </LLinkShell>
  );
}
