import { friendProfileOptions } from "@/lib/friends/profileOptions";
import { segmentOperators, segmentStatuses, type LLinkSegment, type LLinkSegmentCondition } from "@/lib/segments/lLinkSegments";
import { FormSubmitButton } from "@/components/FormSubmitButton";

const statusLabels: Record<string, string> = {
  active: "有効",
  inactive: "停止中",
};

const fieldLabels: Record<string, string> = {
  tag_includes: "タグを含む",
  tag_not_includes: "タグを含まない",
  friend_status: "友だち状態",
  customer_status: "顧客ステータス",
  source: "流入経路",
  inquiry_type: "問い合わせ種別",
  interest_category: "興味カテゴリ",
  vehicle_inspection_expiry_date: "車検満了日",
  last_message_at: "最終メッセージ日時",
  last_interaction_at: "最終接触日時",
  form_answer_exists: "フォーム回答あり",
  form_answer_not_exists: "フォーム回答なし",
};

const operatorLabels: Record<string, string> = {
  equals: "一致する",
  not_equals: "一致しない",
  contains: "含む",
  not_contains: "含まない",
  before: "より前",
  after: "より後",
  between: "の間（範囲）",
  is_empty: "未設定",
  is_not_empty: "設定あり",
};

function conditionAt(conditions: LLinkSegmentCondition[], index: number) {
  return conditions.find((condition) => condition.sort_order === index) ?? conditions[index] ?? null;
}

export function SegmentForm({
  segment,
  conditions = [],
  tags,
  action,
  submitLabel,
}: {
  segment?: LLinkSegment | null;
  conditions?: LLinkSegmentCondition[];
  tags: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-slate-500">セグメント名</span>
          <input name="name" required defaultValue={segment?.name ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">ステータス</span>
          <select name="status" defaultValue={segment?.status ?? "active"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {segmentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-500">説明</span>
          <textarea name="description" rows={3} defaultValue={segment?.description ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-black">条件</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">初期実装では、タグ・友だち状態・顧客ステータス・問い合わせ種別・興味カテゴリを中心に対象者を抽出します。</p>
        </div>
        {Array.from({ length: 8 }, (_, index) => {
          const condition = conditionAt(conditions, index);
          const field = String(condition?.field ?? condition?.condition_type ?? "");
          return (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[190px_150px_1fr_1fr]">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">条件タイプ</span>
                <select name={`condition_field_${index}`} defaultValue={field} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="">未設定</option>
                  {Object.entries(fieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">演算</span>
                <select name={`condition_operator_${index}`} defaultValue={condition?.operator ?? "equals"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  {segmentOperators.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">値</span>
                <select name={`condition_value_${index}`} defaultValue={condition?.value ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="">値を選択 / または下の自由入力を使用</option>
                  <optgroup label="タグ">
                    {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </optgroup>
                  <optgroup label="友だち状態">
                    <option value="active">有効</option>
                    <option value="unfollowed">unfollowed</option>
                  </optgroup>
                  <optgroup label="顧客ステータス">
                    {friendProfileOptions.customer_status.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </optgroup>
                  <optgroup label="問い合わせ種別">
                    {friendProfileOptions.inquiry_type.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </optgroup>
                  <optgroup label="興味カテゴリ">
                    {friendProfileOptions.interest_category.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </optgroup>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">終了値 between用</span>
                <input name={`condition_value_to_${index}`} defaultValue={condition?.value_json?.value_to ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
            </div>
          );
        })}
      </section>

      <FormSubmitButton label={submitLabel} />
    </form>
  );
}
