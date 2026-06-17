import type { FriendTag } from "@/lib/line/friends";
import { profileMappings, questionTypes, type LLinkForm, type LLinkFormQuestion } from "@/lib/forms/lLinkForms";

const questionTypeLabels: Record<string, string> = {
  short_text: "短文テキスト",
  long_text: "長文テキスト",
  phone: "電話番号",
  email: "メールアドレス",
  single_choice: "単一選択",
  multiple_choice: "複数選択",
  date: "日付",
  vehicle_inspection_expiry_date: "車検満了日",
  inquiry_type: "問い合わせ種別",
  interest_category: "興味カテゴリ",
};

const profileMappingLabels: Record<string, string> = {
  real_name: "氏名",
  kana: "フリガナ",
  phone: "電話番号",
  email: "メール",
  birth_date: "生年月日",
  gender: "性別",
  address: "住所",
  customer_status: "顧客ステータス",
  source: "流入経路",
  preferred_contact_method: "希望連絡方法",
  vehicle_inspection_expiry_date: "車検満了日",
  inquiry_type: "問い合わせ種別",
  interest_category: "興味カテゴリ",
  preferred_visit_date: "来店希望日",
  desired_vehicle: "購入検討車種",
  owned_vehicle: "所有車両",
};

function questionAt(questions: LLinkFormQuestion[], index: number) {
  return questions.find((question) => question.sort_order === index) ?? questions[index] ?? null;
}

export function FormEditor({
  form,
  questions = [],
  tags,
  action,
  submitLabel,
}: {
  form?: LLinkForm | null;
  questions?: LLinkFormQuestion[];
  tags: FriendTag[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-slate-500">フォーム名</span>
          <input name="title" required defaultValue={form?.title ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="flex items-end gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
          <input name="is_public" type="checkbox" defaultChecked={Boolean(form?.is_public)} />
          公開する
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-500">説明文</span>
          <textarea name="description" rows={3} defaultValue={form?.description ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold text-slate-500">回答後に付与する固定タグ</span>
          <select name="auto_tag_ids" multiple defaultValue={form?.auto_tag_ids ?? []} className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
          <span className="mt-1 block text-xs font-bold text-slate-400">複数選択できます。</span>
        </label>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-black">質問項目</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">空欄の行は保存しません。最大10問まで設定できます。</p>
        </div>
        {Array.from({ length: 10 }, (_, index) => {
          const question = questionAt(questions, index);
          return (
            <div key={index} className="rounded-xl border border-slate-200 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_110px]">
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">ラベル</span>
                  <input name={`question_label_${index}`} defaultValue={question?.label ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">質問タイプ</span>
                  <select name={`question_type_${index}`} defaultValue={question?.question_type ?? "short_text"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    {questionTypes.map((type) => <option key={type} value={type}>{questionTypeLabels[type]}</option>)}
                  </select>
                </label>
                <label className="flex items-end gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                  <input name={`question_required_${index}`} type="checkbox" defaultChecked={Boolean(question?.is_required)} />
                  必須
                </label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">選択肢</span>
                  <textarea name={`question_options_${index}`} rows={3} defaultValue={(question?.options ?? []).join("\n")} placeholder={"1行に1つ\n例: 購入相談"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">友だち情報への反映先</span>
                  <select name={`question_mapping_${index}`} defaultValue={question?.profile_mapping ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="">反映しない</option>
                    {profileMappings.map((mapping) => <option key={mapping} value={mapping}>{profileMappingLabels[mapping]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">回答時に付与するタグ</span>
                  <select name={`question_tag_${index}`} defaultValue={question?.auto_tag_id ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="">付与しない</option>
                    {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <button className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-700">{submitLabel}</button>
    </form>
  );
}
