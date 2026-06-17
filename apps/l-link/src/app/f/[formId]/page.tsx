import { redirect } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { getFormWithQuestions, submitPublicForm, type LLinkFormQuestion } from "@/lib/forms/lLinkForms";
import { optionsForPublicQuestion } from "@/lib/friends/profileOptions";

function appName() {
  return "L-Link";
}

function renderQuestion(question: LLinkFormQuestion) {
  const name = `question_${question.id}`;
  const baseClass = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

  if (question.question_type === "long_text") {
    return <textarea name={name} required={question.is_required} rows={4} className={baseClass} />;
  }

  if (question.question_type === "single_choice" || question.question_type === "inquiry_type" || question.question_type === "interest_category") {
    const options = question.question_type === "inquiry_type" || question.question_type === "interest_category"
      ? optionsForPublicQuestion(question.question_type, question.options)
      : (question.options ?? []).map((option) => ({ value: option, label: option }));
    return (
      <select name={name} required={question.is_required} className={baseClass}>
        <option value="">選択してください</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (question.question_type === "multiple_choice") {
    return (
      <div className="mt-2 space-y-2">
        {(question.options ?? []).map((option) => (
          <label key={option} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
            <input type="checkbox" name={name} value={option} />
            {option}
          </label>
        ))}
      </div>
    );
  }

  const type = question.question_type === "email"
    ? "email"
    : question.question_type === "phone"
      ? "tel"
      : question.question_type === "date" || question.question_type === "vehicle_inspection_expiry_date"
        ? "date"
        : "text";

  return <input name={name} type={type} required={question.is_required} className={baseClass} />;
}

async function submitAnswerAction(formId: string, formData: FormData) {
  "use server";

  const result = await submitPublicForm(formId, formData);
  if (result.data) {
    redirect(`/f/${formId}?submitted=1`);
  }
  redirect(`/f/${formId}?form_error=${encodeURIComponent(result.error ?? "回答を保存できませんでした")}`);
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { formId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const submitted = resolvedSearchParams.submitted === "1";
  const error = typeof resolvedSearchParams.form_error === "string" ? resolvedSearchParams.form_error : "";
  const lineUserId = typeof resolvedSearchParams.line_user_id === "string" ? resolvedSearchParams.line_user_id : "";
  const result = await getFormWithQuestions(formId, { publicOnly: true });

  if (!result.data) {
    return (
      <main className="min-h-screen bg-[#F3FBF6] px-5 py-10 text-slate-950">
        <UiCard className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-black">{appName()}</h1>
          <p className="mt-4 text-sm font-bold text-slate-500">フォームが見つからないか、現在非公開です。</p>
        </UiCard>
      </main>
    );
  }

  const { form, questions } = result.data;

  return (
    <main className="min-h-screen bg-[#F3FBF6] px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl space-y-5">
        <UiCard>
          <p className="text-sm font-black text-green-700">{appName()}</p>
          <h1 className="mt-2 text-2xl font-black">{form.title}</h1>
          {form.description ? <p className="mt-3 whitespace-pre-wrap text-sm font-bold text-slate-500">{form.description}</p> : null}
        </UiCard>

        {submitted ? (
          <UiCard>
            <h2 className="text-xl font-black">回答を受け付けました</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">送信ありがとうございました。</p>
          </UiCard>
        ) : (
          <UiCard>
            {error ? <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
            <form action={submitAnswerAction.bind(null, form.id)} className="space-y-5">
              <input type="hidden" name="line_user_id" value={lineUserId} />
              {questions.map((question) => (
                <label key={question.id} className="block">
                  <span className="text-sm font-black text-slate-700">
                    {question.label}
                    {question.is_required ? <span className="ml-1 text-red-500">必須</span> : null}
                  </span>
                  {renderQuestion(question)}
                </label>
              ))}
              <button className="w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-green-700">送信する</button>
            </form>
          </UiCard>
        )}
      </div>
    </main>
  );
}
