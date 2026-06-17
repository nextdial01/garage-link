import { redirect } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { FormEditor } from "../FormEditor";
import { createFormFromFormData } from "@/lib/forms/lLinkForms";
import { listTags } from "@/lib/line/friends";

async function createFormAction(formData: FormData) {
  "use server";

  const result = await createFormFromFormData(formData);
  if (result.data) {
    redirect(`/forms/${result.data}?form_message=${encodeURIComponent("フォームを作成しました")}`);
  }
  redirect(`/forms/new?form_error=${encodeURIComponent(result.error ?? "フォーム作成に失敗しました")}`);
}

export default async function NewFormPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const error = typeof params.form_error === "string" ? params.form_error : "";
  const tags = await listTags();

  return (
    <LLinkShell title="回答フォーム作成" description="質問項目と友だち情報への反映先を設定します。">
      <div className="space-y-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        <UiCard>
          <FormEditor tags={tags} action={createFormAction} submitLabel="作成する" />
        </UiCard>
      </div>
    </LLinkShell>
  );
}
