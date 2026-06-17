import { redirect } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { BroadcastForm } from "../BroadcastForm";
import { createBroadcastFromFormData, listBroadcastFormOptions } from "@/lib/broadcasts/lLinkBroadcasts";

async function createBroadcastAction(formData: FormData) {
  "use server";

  const result = await createBroadcastFromFormData(formData);
  if (result.data) redirect(`/broadcasts/${result.data}?broadcast_message=${encodeURIComponent("配信下書きを保存しました")}`);
  redirect(`/broadcasts/new?broadcast_error=${encodeURIComponent(result.error ?? "配信下書きを保存できませんでした")}`);
}

export default async function NewBroadcastPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const error = typeof params.broadcast_error === "string" ? params.broadcast_error : "";
  const options = await listBroadcastFormOptions();

  return (
    <LLinkShell title="一斉配信下書き作成" description="LINE送信は行わず、本文と対象者プレビューを保存します。">
      <div className="space-y-5">
        {error || options.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error || options.error}</div> : null}
        <UiCard>
          <BroadcastForm tags={options.tags} segments={options.segments} action={createBroadcastAction} />
        </UiCard>
      </div>
    </LLinkShell>
  );
}
