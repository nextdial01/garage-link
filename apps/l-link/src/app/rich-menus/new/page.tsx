import { redirect } from "next/navigation";
import { UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createRichMenuFromFormData } from "@/lib/rich-menus/lLinkRichMenus";
import { RichMenuForm } from "../RichMenuForm";

async function createRichMenuAction(formData: FormData) {
  "use server";

  const result = await createRichMenuFromFormData(formData);
  if (result.data) {
    redirect(`/rich-menus/${result.data}?rich_menu_message=${encodeURIComponent("リッチメニューを作成しました")}`);
  }
  redirect(`/rich-menus/new?rich_menu_error=${encodeURIComponent(result.error ?? "リッチメニューを作成できませんでした")}`);
}

export default async function NewRichMenuPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const error = typeof params.rich_menu_error === "string" ? params.rich_menu_error : "";

  return (
    <LLinkShell title="リッチメニュー作成" description="画像、サイズ、ステータスを設定してリッチメニューの下書きを作成します。">
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          LINE公式アカウントへの反映は今後対応です。現在はL-Link内での設計・保存のみです。
        </div>
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
        <UiCard>
          <RichMenuForm action={createRichMenuAction} submitLabel="作成する" />
        </UiCard>
      </div>
    </LLinkShell>
  );
}
