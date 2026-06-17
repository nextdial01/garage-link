import { broadcastStatuses, type BroadcastStatus } from "@/lib/broadcasts/lLinkBroadcasts";
import type { LLinkSegment } from "@/lib/segments/lLinkSegments";
import { FormSubmitButton } from "@/components/FormSubmitButton";

const statusLabels: Record<BroadcastStatus, string> = {
  draft: "下書き",
  scheduled: "予約予定",
  ready: "確認済み",
  sent: "送信済み",
  canceled: "キャンセル",
};

export function BroadcastForm({
  tags,
  segments,
  action,
}: {
  tags: { id: string; name: string }[];
  segments: LLinkSegment[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-slate-500">配信名</span>
          <input name="name" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">ステータス</span>
          <select name="status" defaultValue="draft" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {broadcastStatuses.filter((status) => status === "draft" || status === "scheduled").map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-500">メッセージ本文</span>
          <textarea name="message_text" required rows={5} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">配信対象</span>
          <select name="target_type" defaultValue="all" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">全友だち</option>
            <option value="tag">タグ指定</option>
            <option value="segment">セグメント指定</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">配信予定日時</span>
          <input name="scheduled_at" type="datetime-local" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">タグ指定</span>
          <select name="target_tag_ids" multiple className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
          <span className="mt-1 block text-xs font-bold text-slate-400">タグ指定を選んだ場合のみ使用します。</span>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">セグメント指定</span>
          <select name="target_segment_id" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">セグメントを選択</option>
            {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
          </select>
          <span className="mt-1 block text-xs font-bold text-slate-400">セグメント指定を選んだ場合のみ使用します。</span>
        </label>
      </section>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
        LINE公式アカウントへの本送信は今後対応です。現在は配信下書き・対象者確認・ログ土台のみ保存します。
      </div>
      <FormSubmitButton label="下書きを保存" />
    </form>
  );
}
