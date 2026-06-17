import { notFound, redirect } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { getSegment, updateSegmentFromFormData } from "@/lib/segments/lLinkSegments";
import { SegmentForm } from "../../SegmentForm";

async function updateSegmentAction(segmentId: string, formData: FormData) {
  "use server";

  const result = await updateSegmentFromFormData(segmentId, formData);
  if (result.data) redirect(`/segments/${result.data}?segment_message=${encodeURIComponent("セグメントを更新しました")}`);
  redirect(`/segments/${segmentId}/edit?segment_error=${encodeURIComponent(result.error ?? "セグメントを更新できませんでした")}`);
}

export default async function EditSegmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const error = typeof resolvedSearchParams.segment_error === "string" ? resolvedSearchParams.segment_error : "";
  const result = await getSegment(id);
  if (!result.data) {
    if (result.error === "segment not found") notFound();
    return (
      <LLinkShell title="セグメント編集" description="セグメント条件を編集します。">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{result.error}</div>
      </LLinkShell>
    );
  }

  return (
    <LLinkShell title="セグメント編集" description="条件を変更して対象者を調整します。">
      <div className="space-y-5">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        <UiCard>
          <SegmentForm
            segment={result.data.segment}
            conditions={result.data.conditions}
            tags={result.data.tags}
            action={updateSegmentAction.bind(null, id)}
            submitLabel="更新する"
          />
        </UiCard>
      </div>
    </LLinkShell>
  );
}
