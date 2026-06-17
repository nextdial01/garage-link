import Link from "next/link";
import { notFound } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { getFormWithQuestions, listAnswersForForm, type LLinkFormAnswerItem } from "@/lib/forms/lLinkForms";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function FormAnswersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [formResult, answersResult] = await Promise.all([getFormWithQuestions(id), listAnswersForForm(id)]);
  if (!formResult.data) notFound();

  const answers = answersResult.data?.answers ?? [];
  const items = answersResult.data?.items ?? new Map();

  return (
    <LLinkShell title="フォーム回答一覧" description="送信された回答と友だち紐づけ状況を確認します。">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Link href={`/forms/${id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">フォーム詳細へ戻る</Link>
        </div>
        {answersResult.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{answersResult.error}</div> : null}
        <UiCard>
          <h2 className="text-lg font-black">{formResult.data.form.title}</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">回答数: {answers.length}件</p>
        </UiCard>
        <div className="space-y-4">
          {answers.length === 0 ? (
            <UiCard><p className="text-center text-sm font-bold text-slate-500">回答がありません</p></UiCard>
          ) : answers.map((answer) => (
            <UiCard key={answer.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">回答日時: {formatDate(answer.submitted_at)}</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">line_user_id: {answer.line_user_id ?? "-"}</p>
                </div>
                {answer.line_friend_id ? <Link href={`/friends/${answer.line_friend_id}`} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">友だち詳細</Link> : null}
              </div>
              <dl className="mt-4 grid gap-3 md:grid-cols-2">
                {(items.get(answer.id) ?? []).map((item: LLinkFormAnswerItem) => (
                  <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">{item.label ?? item.question_id ?? "質問"}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-900">{item.answer_text ?? (item.answer_values ?? []).join(", ")}</dd>
                  </div>
                ))}
              </dl>
            </UiCard>
          ))}
        </div>
      </div>
    </LLinkShell>
  );
}
