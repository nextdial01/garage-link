import { notFound, redirect } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { FormEditor } from "../../FormEditor";
import { getFormWithQuestions, updateFormFromFormData } from "@/lib/forms/lLinkForms";
import { listTags } from "@/lib/line/friends";

async function updateFormAction(formId: string, formData: FormData) {
  "use server";

  const result = await updateFormFromFormData(formId, formData);
  if (result.data) {
    redirect(`/forms/${result.data}?form_message=${encodeURIComponent("フォームを保存しました")}`);
  }
  redirect(`/forms/${formId}/edit?form_error=${encodeURIComponent(result.error ?? "フォーム保存に失敗しました")}`);
}

export default async function EditFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const error = typeof resolvedSearchParams.form_error === "string" ? resolvedSearchParams.form_error : "";
  const [formResult, tags] = await Promise.all([getFormWithQuestions(id), listTags()]);

  if (!formResult.data) notFound();

  return (
    <LLinkShell title="回答フォーム編集" description="質問項目、プロフィール反映先、回答時タグを編集します。">
      <div className="space-y-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        <UiCard>
          <FormEditor
            form={formResult.data.form}
            questions={formResult.data.questions}
            tags={tags}
            action={updateFormAction.bind(null, id)}
            submitLabel="保存する"
          />
        </UiCard>
      </div>
    </LLinkShell>
  );
}
