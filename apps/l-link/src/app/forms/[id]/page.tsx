import Link from "next/link";
import { notFound } from "next/navigation";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { getFormWithQuestions } from "@/lib/forms/lLinkForms";

function publicUrl(formId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_L_LINK_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  return `${baseUrl.replace(/\/$/, "")}/f/${formId}`;
}

export default async function FormDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const message = typeof resolvedSearchParams.form_message === "string" ? resolvedSearchParams.form_message : "";
  const result = await getFormWithQuestions(id);
  if (!result.data) notFound();

  const { form, questions } = result.data;

  return (
    <LLinkShell title="回答フォーム詳細" description="フォームの公開状態、質問、回答URLを確認します。">
      <div className="space-y-5">
        {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{message}</div> : null}
        <div className="flex flex-wrap gap-2">
          <Link href="/forms" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">一覧に戻る</Link>
          <Link href={`/forms/${form.id}/edit`} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">編集</Link>
          <Link href={`/forms/${form.id}/answers`} className="rounded-xl border border-green-200 bg-white px-4 py-2 text-sm font-bold text-green-700">回答一覧</Link>
        </div>

        <UiCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">{form.title}</h2>
              <p className="mt-2 text-sm font-bold text-slate-500">{form.description || "説明文は未設定です"}</p>
            </div>
            <UiBadge tone={form.is_public ? "green" : "slate"}>{form.is_public ? "公開" : "非公開"}</UiBadge>
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">公開URL</p>
            <p className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{form.is_public ? publicUrl(form.id) : "非公開です"}</p>
          </div>
        </UiCard>

        <UiCard className="p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-black">質問項目</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {questions.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm font-bold text-slate-500">質問がありません</p>
            ) : questions.map((question) => (
              <div key={question.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-950">{question.label}</p>
                  <UiBadge tone="slate">{question.question_type}</UiBadge>
                  {question.is_required ? <UiBadge tone="green">必須</UiBadge> : null}
                </div>
                <p className="mt-1 text-sm font-bold text-slate-500">反映先: {question.profile_mapping ?? "なし"} / 回答時タグ: {question.auto_tag_id ? "設定あり" : "なし"}</p>
              </div>
            ))}
          </div>
        </UiCard>
      </div>
    </LLinkShell>
  );
}
