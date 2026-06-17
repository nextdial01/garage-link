import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { getCurrentLLinkCompany, getPrimaryLineAccount } from "@/lib/supabase/server";
import Link from "next/link";

function display(value: string | boolean | null | undefined) {
  if (typeof value === "boolean") return value ? "接続済み" : "未接続";
  return value ? String(value) : "未設定";
}

export default async function SettingsPage() {
  const currentCompany = await getCurrentLLinkCompany();
  const account = await getPrimaryLineAccount(currentCompany?.companyId);

  return (
    <LLinkShell title="設定" description="L-LinkのLINE接続、メンバー、権限を管理します。">
      <div className="space-y-5">
      <UiCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">会社・店舗設定</h2>
            <p className="mt-1 text-sm text-slate-500">L-Linkを利用する会社・店舗と、現在ユーザーの所属を設定します。</p>
          </div>
          <Link href="/settings/organization" className="rounded-xl border border-green-200 px-4 py-2 text-sm font-bold text-green-700 hover:bg-green-50">
            会社・店舗設定を開く
          </Link>
        </div>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-bold text-slate-500">会社/店舗情報</dt>
            <dd className="mt-1 text-sm font-black text-slate-950">{currentCompany?.companyId ? "設定済み" : "未設定"}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-bold text-slate-500">取得元</dt>
            <dd className="mt-1 text-sm font-black text-slate-950">{currentCompany?.source ?? "未設定"}</dd>
          </div>
        </dl>
      </UiCard>

      <UiCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">接続設定</h2>
            <p className="mt-1 text-sm text-slate-500">SecretとTokenは平文表示せず、マスク状態だけを扱います。</p>
          </div>
          <Link href="/settings/line" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">LINE接続を開く</Link>
        </div>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Channel ID", display(account?.channel_id)],
            ["Basic ID", display(account?.basic_id)],
            ["Webhook URL", display(account?.webhook_url)],
            ["Channel Secret", "************"],
            ["Channel Access Token", "************"],
            ["接続状態", display(account?.is_connected)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-bold text-slate-500">{label}</dt>
              <dd className="mt-1 text-sm font-black text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>
      </UiCard>
      </div>
    </LLinkShell>
  );
}
