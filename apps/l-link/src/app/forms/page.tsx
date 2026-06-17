import Link from "next/link";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { listForms } from "@/lib/forms/lLinkForms";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function publicUrl(formId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  return `${baseUrl.replace(/\/$/, "")}/f/${formId}`;
}

export default async function FormsPage() {
  const result = await listForms();
  const forms = result.data ?? [];

  return (
    <LLinkShell title="回答フォーム" description="友だち情報を集めるフォームを作成し、回答から顧客情報やタグへ反映します。">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/forms/new" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">
            新規作成
          </Link>
        </div>

        {result.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div>
        ) : null}

        <UiCard className="p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">フォーム一覧</h2>
            <UiBadge tone="green">{forms.length}件</UiBadge>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">フォーム名</th>
                  <th className="px-4 py-3">公開状態</th>
                  <th className="px-4 py-3 text-right">回答数</th>
                  <th className="px-4 py-3">作成日</th>
                  <th className="px-4 py-3">公開URL</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forms.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center font-bold text-slate-500">データがありません</td></tr>
                ) : forms.map((form) => (
                  <tr key={form.id} className="hover:bg-green-50/60">
                    <td className="px-4 py-3 font-bold text-slate-950"><Link href={`/forms/${form.id}`}>{form.title}</Link></td>
                    <td className="px-4 py-3"><UiBadge tone={form.is_public ? "green" : "slate"}>{form.is_public ? "公開" : "非公開"}</UiBadge></td>
                    <td className="px-4 py-3 text-right">{form.answer_count ?? 0}</td>
                    <td className="px-4 py-3">{formatDate(form.created_at)}</td>
                    <td className="px-4 py-3 break-all font-mono text-xs">{form.is_public ? publicUrl(form.id) : "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/forms/${form.id}/edit`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-50">編集</Link>
                        <Link href={`/forms/${form.id}/answers`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">回答一覧</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
