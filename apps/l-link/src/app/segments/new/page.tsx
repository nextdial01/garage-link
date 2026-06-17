import { redirect } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createSegmentFromFormData, listSegmentTags } from "@/lib/segments/lLinkSegments";
import { SegmentForm } from "../SegmentForm";

async function createSegmentAction(formData: FormData) {
  "use server";

  const result = await createSegmentFromFormData(formData);
  if (result.data) redirect(`/segments/${result.data}?segment_message=${encodeURIComponent("セグメントを作成しました")}`);
  redirect(`/segments/new?segment_error=${encodeURIComponent(result.error ?? "セグメントを作成できませんでした")}`);
}

export default async function NewSegmentPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const error = typeof params.segment_error === "string" ? params.segment_error : "";
  const tags = await listSegmentTags();

  return (
    <LLinkShell title="セグメント作成" description="条件を設定して配信対象になる友だちを抽出します。">
      <div className="space-y-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        <UiCard>
          <SegmentForm tags={tags} action={createSegmentAction} submitLabel="作成する" />
        </UiCard>
      </div>
    </LLinkShell>
  );
}
