import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UiBadge, UiCard } from "@garage-link/ui";
import { LLinkShell } from "@/components/LLinkShell";
import { createLLinkServiceClient, getCurrentLLinkCompany } from "@/lib/supabase/server";
import { getFriendDetail, listFriendNotes, listFriendTags, listMessageLogs, listTags } from "@/lib/line/friends";
import { listAnswersForFriend, type LLinkFormAnswerItem } from "@/lib/forms/lLinkForms";
import {
  friendProfileOptions,
  getFriendProfileOptionLabel,
  normalizeFriendProfileOptionValue,
  type FriendProfileOptionField,
} from "@/lib/friends/profileOptions";

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formValue(value: string | null | undefined) {
  return value ?? "";
}

function dateValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function datetimeValue(value: string | null | undefined) {
  return value ? value.slice(0, 16) : "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function lineDisplayName(friend: { display_name: string | null; line_user_id: string }) {
  return friend.display_name || friend.line_user_id;
}

async function getCompanyId() {
  const currentCompany = await getCurrentLLinkCompany();
  return currentCompany?.companyId ?? null;
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function safeErrorDetail(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ? `${error.code} / ` : "";
  const message = error?.message ?? "unknown error";
  return `${code}${message}`.slice(0, 220);
}

function actionMessage(operation: string, error: { code?: string; message?: string } | null | undefined) {
  if (!isDevelopment()) return "保存に失敗しました";
  if (error?.code === "42501") return `${operation}: RLS violation or permission denied (${safeErrorDetail(error)})`;
  return `${operation}: ${safeErrorDetail(error)}`;
}

function actionRedirect(friendId: string, status: "success" | "error", message: string): never {
  const params = new URLSearchParams({
    friend_action_status: status,
    friend_action_message: message,
  });
  redirect(`/friends/${friendId}?${params.toString()}`);
}

async function ensureFriendBelongsToCompany(
  supabase: NonNullable<ReturnType<typeof createLLinkServiceClient>>,
  companyId: string,
  friendId: string,
) {
  const { data, error } = await supabase
    .from("ll_line_friends")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", friendId)
    .maybeSingle();

  if (error) return actionMessage("friend ownership check failed", error);
  if (!data) return "対象の友だちが見つかりません";
  return null;
}

async function updateProfile(friendId: string, formData: FormData) {
  "use server";

  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) actionRedirect(friendId, "error", "service role key missing");
  if (!companyId) actionRedirect(friendId, "error", "company_id が取得できません");

  const ownershipError = await ensureFriendBelongsToCompany(supabase, companyId, friendId);
  if (ownershipError) actionRedirect(friendId, "error", ownershipError);

  const { error } = await supabase.from("ll_friend_profiles").upsert(
    {
      company_id: companyId,
      line_friend_id: friendId,
      real_name: String(formData.get("real_name") ?? ""),
      kana: String(formData.get("kana") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      birth_date: String(formData.get("birth_date") ?? "") || null,
      gender: String(formData.get("gender") ?? ""),
      postal_code: String(formData.get("postal_code") ?? ""),
      address: String(formData.get("address") ?? ""),
      customer_status: normalizeFriendProfileOptionValue("customer_status", String(formData.get("customer_status") ?? "")),
      source: normalizeFriendProfileOptionValue("source", String(formData.get("source") ?? "")),
      assigned_staff_id: String(formData.get("assigned_staff_id") ?? "") || null,
      preferred_contact_method: normalizeFriendProfileOptionValue("preferred_contact_method", String(formData.get("preferred_contact_method") ?? "")),
      interest_category: normalizeFriendProfileOptionValue("interest_category", String(formData.get("interest_category") ?? "")),
      inquiry_type: normalizeFriendProfileOptionValue("inquiry_type", String(formData.get("inquiry_type") ?? "")),
      memo_summary: String(formData.get("memo_summary") ?? ""),
      owned_vehicle: String(formData.get("owned_vehicle") ?? ""),
      vehicle_inspection_expiry_date: String(formData.get("vehicle_inspection_expiry_date") ?? "") || null,
      desired_vehicle: String(formData.get("desired_vehicle") ?? ""),
      preferred_visit_date: String(formData.get("preferred_visit_date") ?? "") || null,
      last_contact_note: String(formData.get("last_contact_note") ?? ""),
      next_follow_up_at: String(formData.get("next_follow_up_at") ?? "") || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "line_friend_id" }
  );

  if (error) actionRedirect(friendId, "error", actionMessage("friend profile upsert failed", error));

  revalidatePath(`/friends/${friendId}`);
  actionRedirect(friendId, "success", "顧客情報を保存しました");
}

async function addNote(friendId: string, formData: FormData) {
  "use server";

  const body = String(formData.get("body") ?? "").trim();
  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) actionRedirect(friendId, "error", "service role key missing");
  if (!companyId) actionRedirect(friendId, "error", "company_id が取得できません");
  if (!body) actionRedirect(friendId, "error", "メモ本文を入力してください");

  const ownershipError = await ensureFriendBelongsToCompany(supabase, companyId, friendId);
  if (ownershipError) actionRedirect(friendId, "error", ownershipError);

  const { error } = await supabase.from("ll_friend_notes").insert({
    company_id: companyId,
    line_friend_id: friendId,
    body,
  });

  if (error) actionRedirect(friendId, "error", actionMessage("friend note insert failed", error));

  revalidatePath(`/friends/${friendId}`);
  actionRedirect(friendId, "success", "メモを追加しました");
}

async function updateNote(friendId: string, noteId: string, formData: FormData) {
  "use server";

  const body = String(formData.get("body") ?? "").trim();
  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) actionRedirect(friendId, "error", "service role key missing");
  if (!companyId) actionRedirect(friendId, "error", "company_id が取得できません");
  if (!body) actionRedirect(friendId, "error", "メモ本文を入力してください");

  const ownershipError = await ensureFriendBelongsToCompany(supabase, companyId, friendId);
  if (ownershipError) actionRedirect(friendId, "error", ownershipError);

  const { error } = await supabase
    .from("ll_friend_notes")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("line_friend_id", friendId)
    .eq("id", noteId);

  if (error) actionRedirect(friendId, "error", actionMessage("friend note update failed", error));

  revalidatePath(`/friends/${friendId}`);
  actionRedirect(friendId, "success", "メモを更新しました");
}

async function deleteNote(friendId: string, noteId: string) {
  "use server";

  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) actionRedirect(friendId, "error", "service role key missing");
  if (!companyId) actionRedirect(friendId, "error", "company_id が取得できません");

  const ownershipError = await ensureFriendBelongsToCompany(supabase, companyId, friendId);
  if (ownershipError) actionRedirect(friendId, "error", ownershipError);

  const { error } = await supabase
    .from("ll_friend_notes")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("line_friend_id", friendId)
    .eq("id", noteId);

  if (error) actionRedirect(friendId, "error", actionMessage("friend note delete failed", error));

  revalidatePath(`/friends/${friendId}`);
  actionRedirect(friendId, "success", "メモを削除しました");
}

async function addTag(friendId: string, formData: FormData) {
  "use server";

  const tagId = String(formData.get("tag_id") ?? "");
  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) actionRedirect(friendId, "error", "service role key missing");
  if (!companyId) actionRedirect(friendId, "error", "company_id が取得できません");
  if (!tagId) actionRedirect(friendId, "error", "タグを選択してください");

  const ownershipError = await ensureFriendBelongsToCompany(supabase, companyId, friendId);
  if (ownershipError) actionRedirect(friendId, "error", ownershipError);

  const { error } = await supabase.from("ll_friend_tags").upsert(
    {
      company_id: companyId,
      line_friend_id: friendId,
      tag_id: tagId,
    },
    { onConflict: "company_id,line_friend_id,tag_id" }
  );

  if (error) actionRedirect(friendId, "error", actionMessage("friend tag upsert failed", error));

  revalidatePath(`/friends/${friendId}`);
  actionRedirect(friendId, "success", "タグを付与しました");
}

async function removeTag(friendId: string, tagId: string) {
  "use server";

  const supabase = createLLinkServiceClient();
  const companyId = await getCompanyId();
  if (!supabase) actionRedirect(friendId, "error", "service role key missing");
  if (!companyId) actionRedirect(friendId, "error", "company_id が取得できません");

  const ownershipError = await ensureFriendBelongsToCompany(supabase, companyId, friendId);
  if (ownershipError) actionRedirect(friendId, "error", ownershipError);

  const { error } = await supabase.from("ll_friend_tags").delete().eq("company_id", companyId).eq("line_friend_id", friendId).eq("tag_id", tagId);
  if (error) actionRedirect(friendId, "error", actionMessage("friend tag delete failed", error));

  revalidatePath(`/friends/${friendId}`);
  actionRedirect(friendId, "success", "タグを解除しました");
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
    </label>
  );
}

function SelectField({
  label,
  name,
  field,
  defaultValue,
}: {
  label: string;
  name: string;
  field: FriendProfileOptionField;
  defaultValue?: string | null;
}) {
  const value = defaultValue ?? "";
  const known = !value || friendProfileOptions[field].some((option) => option.value === value || option.label === value);
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <select name={name} defaultValue={value} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
        <option value="">未設定</option>
        {!known ? <option value={value}>現在の値: {value}</option> : null}
        {friendProfileOptions[field].map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function FriendDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const actionStatus = typeof resolvedSearchParams.friend_action_status === "string" ? resolvedSearchParams.friend_action_status : "";
  const actionMessageText = typeof resolvedSearchParams.friend_action_message === "string" ? resolvedSearchParams.friend_action_message : "";
  const friend = await getFriendDetail(id);
  if (!friend) notFound();

  const [notes, tags, attachedTagIds, messages, formAnswersResult] = await Promise.all([
    listFriendNotes(id),
    listTags(),
    listFriendTags(id),
    listMessageLogs(id),
    listAnswersForFriend(id),
  ]);

  const attachedTags = tags.filter((tag) => attachedTagIds.has(tag.id));
  const availableTags = tags.filter((tag) => !attachedTagIds.has(tag.id));
  const formAnswers = formAnswersResult.data?.answers ?? [];
  const formMap = formAnswersResult.data?.formMap ?? new Map();
  const answerItems = formAnswersResult.data?.items ?? new Map();

  return (
    <LLinkShell title="友だち詳細" description="LINEプロフィールとL-Link側で管理する顧客情報を確認・編集します。">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/friends" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">一覧に戻る</Link>
      </div>

      {actionMessageText ? (
        <div
          className={
            actionStatus === "success"
              ? "mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700"
              : "mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
          }
        >
          {actionMessageText}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <UiCard>
            <div className="flex items-start gap-4">
              {friend.picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={friend.picture_url} alt="" className="h-16 w-16 rounded-full bg-slate-100 object-cover" />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full bg-green-50 text-xl font-black text-green-700">LL</div>
              )}
              <div>
                <h2 className="text-xl font-black">{lineDisplayName(friend)}</h2>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{friend.line_user_id}</p>
                <div className="mt-3"><UiBadge tone={friend.friend_status === "active" ? "green" : "slate"}>{friend.friend_status}</UiBadge></div>
              </div>
            </div>
            <dl className="mt-6 space-y-3 text-sm">
              <div><dt className="font-bold text-slate-500">ステータスメッセージ</dt><dd>{display(friend.status_message)}</dd></div>
              <div><dt className="font-bold text-slate-500">言語</dt><dd>{display(friend.language)}</dd></div>
              <div><dt className="font-bold text-slate-500">友だち追加日</dt><dd>{formatDate(friend.followed_at)}</dd></div>
              <div><dt className="font-bold text-slate-500">最終接触日</dt><dd>{formatDate(friend.last_interaction_at)}</dd></div>
              <div><dt className="font-bold text-slate-500">最終メッセージ日時</dt><dd>{formatDate(friend.last_message_at)}</dd></div>
              <div><dt className="font-bold text-slate-500">顧客ステータス</dt><dd>{getFriendProfileOptionLabel("customer_status", friend.customer_status)}</dd></div>
              <div><dt className="font-bold text-slate-500">流入経路</dt><dd>{getFriendProfileOptionLabel("source", friend.profile.source)}</dd></div>
              <div><dt className="font-bold text-slate-500">希望連絡方法</dt><dd>{getFriendProfileOptionLabel("preferred_contact_method", friend.profile.preferred_contact_method)}</dd></div>
              <div><dt className="font-bold text-slate-500">興味カテゴリ</dt><dd>{getFriendProfileOptionLabel("interest_category", friend.interest_category)}</dd></div>
              <div><dt className="font-bold text-slate-500">問い合わせ種別</dt><dd>{getFriendProfileOptionLabel("inquiry_type", friend.inquiry_type)}</dd></div>
            </dl>
          </UiCard>

          <UiCard>
            <h2 className="text-lg font-black">タグ一覧</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {attachedTags.length === 0 ? <p className="text-sm font-bold text-slate-500">タグがありません</p> : attachedTags.map((tag) => (
                <form key={tag.id} action={removeTag.bind(null, id, tag.id)} className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                  <span>{tag.name}</span>
                  <button className="text-green-900">解除</button>
                </form>
              ))}
            </div>
            <form action={addTag.bind(null, id)} className="mt-4 flex gap-2">
              <select name="tag_id" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">タグを選択</option>
                {availableTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
              <button className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">付与</button>
            </form>
          </UiCard>
        </div>

        <div className="space-y-5">
          <UiCard>
            <h2 className="text-lg font-black">顧客情報</h2>
            <form action={updateProfile.bind(null, id)} className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="氏名" name="real_name" defaultValue={formValue(friend.real_name)} />
              <Field label="フリガナ" name="kana" defaultValue={formValue(friend.profile.kana)} />
              <Field label="電話番号" name="phone" defaultValue={formValue(friend.phone)} />
              <Field label="メールアドレス" name="email" type="email" defaultValue={formValue(friend.email)} />
              <Field label="生年月日" name="birth_date" type="date" defaultValue={dateValue(friend.profile.birth_date)} />
              <Field label="性別" name="gender" defaultValue={formValue(friend.profile.gender)} />
              <Field label="郵便番号" name="postal_code" defaultValue={formValue(friend.profile.postal_code)} />
              <Field label="住所" name="address" defaultValue={formValue(friend.profile.address)} />
              <SelectField label="顧客ステータス" name="customer_status" field="customer_status" defaultValue={friend.customer_status} />
              <SelectField label="流入経路" name="source" field="source" defaultValue={friend.profile.source} />
              <Field label="担当スタッフID" name="assigned_staff_id" defaultValue={formValue(friend.profile.assigned_staff_id)} />
              <SelectField label="希望連絡方法" name="preferred_contact_method" field="preferred_contact_method" defaultValue={friend.profile.preferred_contact_method} />
              <SelectField label="興味カテゴリ" name="interest_category" field="interest_category" defaultValue={friend.interest_category} />
              <SelectField label="問い合わせ種別" name="inquiry_type" field="inquiry_type" defaultValue={friend.inquiry_type} />
              <Field label="所有車両" name="owned_vehicle" defaultValue={formValue(friend.profile.owned_vehicle)} />
              <Field label="車検満了日" name="vehicle_inspection_expiry_date" type="date" defaultValue={dateValue(friend.profile.vehicle_inspection_expiry_date)} />
              <Field label="購入検討車種" name="desired_vehicle" defaultValue={formValue(friend.profile.desired_vehicle)} />
              <Field label="来店希望日" name="preferred_visit_date" type="date" defaultValue={dateValue(friend.profile.preferred_visit_date)} />
              <Field label="前回対応内容" name="last_contact_note" defaultValue={formValue(friend.profile.last_contact_note)} />
              <Field label="次回対応予定日" name="next_follow_up_at" type="datetime-local" defaultValue={datetimeValue(friend.profile.next_follow_up_at)} />
              <label className="block md:col-span-2">
                <span className="text-xs font-bold text-slate-500">メモ要約</span>
                <textarea name="memo_summary" defaultValue={formValue(friend.profile.memo_summary)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <div className="md:col-span-2">
                <button className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white">保存する</button>
              </div>
            </form>
          </UiCard>

          <UiCard>
            <h2 className="text-lg font-black">個別メモ</h2>
            <form action={addNote.bind(null, id)} className="mt-4 flex flex-col gap-3">
              <textarea name="body" rows={3} placeholder="対応内容や補足を入力" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <button className="self-start rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">メモ追加</button>
            </form>
            <div className="mt-5 space-y-3">
              {notes.length === 0 ? <p className="text-sm font-bold text-slate-500">メモがありません</p> : notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-slate-200 p-4">
                  <form action={updateNote.bind(null, id, note.id)} className="space-y-3">
                    <textarea name="body" defaultValue={note.body} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-500">作成者: {display(note.created_by)} / 作成日時: {formatDate(note.created_at)}</p>
                      <div className="flex gap-2">
                        <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">編集</button>
                        <button formAction={deleteNote.bind(null, id, note.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600">削除</button>
                      </div>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          </UiCard>

          <section className="grid gap-5 lg:grid-cols-2">
            <UiCard>
              <h2 className="text-lg font-black">メッセージ履歴</h2>
              <div className="mt-4 space-y-3">
                {messages.length === 0 ? <p className="text-sm font-bold text-slate-500">履歴がありません</p> : messages.map((message) => (
                  <div key={message.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex justify-between gap-3 text-xs font-bold text-slate-500">
                      <span>{message.direction} / {display(message.message_type)}</span>
                      <span>{formatDate(message.received_at ?? message.sent_at ?? message.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap">{display(message.message_body)}</p>
                  </div>
                ))}
              </div>
            </UiCard>
            <UiCard>
              <h2 className="text-lg font-black">フォーム回答履歴</h2>
              <div className="mt-4 space-y-3">
                {formAnswers.length === 0 ? (
                  <p className="text-sm font-bold text-slate-500">回答履歴がありません</p>
                ) : formAnswers.map((answer) => (
                  <div key={answer.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500">
                      <span>{formMap.get(answer.form_id)?.title ?? "フォーム"}</span>
                      <span>{formatDate(answer.submitted_at)}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {(answerItems.get(answer.id) ?? []).slice(0, 5).map((item: LLinkFormAnswerItem) => (
                        <p key={item.id} className="whitespace-pre-wrap">
                          {display(item.answer_text ?? (item.answer_values ?? []).join(", "))}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <h2 className="mt-6 text-lg font-black">配信履歴</h2>
              <p className="mt-4 text-sm font-bold text-slate-500">次フェーズで配信履歴を表示します。</p>
              <h2 className="mt-6 text-lg font-black">ステップ配信状態</h2>
              <p className="mt-4 text-sm font-bold text-slate-500">次フェーズでシナリオ進行状況を表示します。</p>
            </UiCard>
          </section>
        </div>
      </div>
    </LLinkShell>
  );
}
