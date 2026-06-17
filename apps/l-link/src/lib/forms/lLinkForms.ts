import 'server-only';
import { createLLinkServiceClient, getCurrentLLinkCompany } from '@/lib/supabase/server';
import { normalizeFriendProfileOptionValue, type FriendProfileOptionField } from '@/lib/friends/profileOptions';

export const questionTypes = [
  'short_text',
  'long_text',
  'phone',
  'email',
  'single_choice',
  'multiple_choice',
  'date',
  'vehicle_inspection_expiry_date',
  'inquiry_type',
  'interest_category',
] as const;

export const profileMappings = [
  'real_name',
  'kana',
  'phone',
  'email',
  'birth_date',
  'gender',
  'address',
  'customer_status',
  'source',
  'preferred_contact_method',
  'vehicle_inspection_expiry_date',
  'inquiry_type',
  'interest_category',
  'preferred_visit_date',
  'desired_vehicle',
  'owned_vehicle',
] as const;

export type QuestionType = (typeof questionTypes)[number];
export type ProfileMapping = (typeof profileMappings)[number];

export type LLinkForm = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: string;
  is_public: boolean;
  auto_tag_ids: string[] | null;
  created_at: string;
  updated_at: string;
  answer_count?: number;
};

export type LLinkFormQuestion = {
  id: string;
  company_id: string;
  form_id: string;
  label: string;
  question_type: QuestionType;
  sort_order: number;
  is_required: boolean;
  options: string[] | null;
  profile_mapping: ProfileMapping | null;
  auto_tag_id: string | null;
  choice_tag_map: Record<string, string> | null;
};

export type LLinkFormAnswer = {
  id: string;
  company_id: string;
  form_id: string;
  line_friend_id: string | null;
  line_user_id: string | null;
  source: string | null;
  submitted_at: string;
  created_at: string;
};

export type LLinkFormAnswerItem = {
  id: string;
  company_id: string;
  form_answer_id: string;
  question_id: string | null;
  answer_text: string | null;
  answer_values: string[] | null;
  label?: string | null;
  question_type?: string | null;
};

export type FormActionResult<T = null> = {
  data: T | null;
  error: string | null;
};

type QuestionInputRow = {
  company_id: string;
  form_id: string;
  label: string;
  question_type: QuestionType;
  is_required: boolean;
  options: string[];
  profile_mapping: ProfileMapping | null;
  auto_tag_id: string | null;
  sort_order: number;
};

function isQuestionInputRow(row: QuestionInputRow | null): row is QuestionInputRow {
  return row !== null;
}

function isDevelopment() {
  return process.env.NODE_ENV !== 'production';
}

function safeErrorDetail(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ? `${error.code} / ` : '';
  const message = error?.message ?? 'unknown error';
  return `${code}${message}`.slice(0, 220);
}

export function formError(operation: string, error: { code?: string; message?: string } | string | null | undefined) {
  if (!isDevelopment()) return '保存に失敗しました';
  if (typeof error === 'string') return `${operation}: ${error}`;
  if (error?.code === '42501') return `${operation}: RLS violation or permission denied (${safeErrorDetail(error)})`;
  return `${operation}: ${safeErrorDetail(error)}`;
}

export async function getCurrentCompanyId() {
  const currentCompany = await getCurrentLLinkCompany();
  return currentCompany?.companyId ?? null;
}

export function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeQuestionType(value: string): QuestionType {
  return questionTypes.includes(value as QuestionType) ? (value as QuestionType) : 'short_text';
}

export function normalizeProfileMapping(value: string): ProfileMapping | null {
  return profileMappings.includes(value as ProfileMapping) ? (value as ProfileMapping) : null;
}

export async function listForms(): Promise<FormActionResult<LLinkForm[]>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: 'forms fetch failed: service role key missing' };
  if (!companyId) return { data: null, error: 'forms fetch failed: company_id missing' };

  const { data: forms, error } = await supabase
    .from('ll_forms')
    .select('id, company_id, title, description, status, is_public, auto_tag_ids, created_at, updated_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: formError('forms fetch failed', error) };

  const formRows = (forms ?? []) as LLinkForm[];
  const ids = formRows.map((form) => form.id);
  const answerCountMap = new Map<string, number>();

  if (ids.length > 0) {
    const { data: answers } = await supabase
      .from('ll_form_answers')
      .select('form_id')
      .eq('company_id', companyId)
      .in('form_id', ids);

    for (const answer of (answers ?? []) as { form_id: string }[]) {
      answerCountMap.set(answer.form_id, (answerCountMap.get(answer.form_id) ?? 0) + 1);
    }
  }

  return {
    data: formRows.map((form) => ({ ...form, answer_count: answerCountMap.get(form.id) ?? 0 })),
    error: null,
  };
}

export async function getFormWithQuestions(formId: string, options?: { publicOnly?: boolean }): Promise<FormActionResult<{ form: LLinkForm; questions: LLinkFormQuestion[] }>> {
  const supabase = createLLinkServiceClient();
  if (!supabase) return { data: null, error: 'form fetch failed: service role key missing' };

  let query = supabase
    .from('ll_forms')
    .select('id, company_id, title, description, status, is_public, auto_tag_ids, created_at, updated_at')
    .eq('id', formId);

  if (options?.publicOnly) {
    query = query.eq('is_public', true);
  } else {
    const companyId = await getCurrentCompanyId();
    if (!companyId) return { data: null, error: 'form fetch failed: company_id missing' };
    query = query.eq('company_id', companyId);
  }

  const { data: form, error: formFetchError } = await query.maybeSingle();
  if (formFetchError) return { data: null, error: formError('form fetch failed', formFetchError) };
  if (!form) return { data: null, error: 'form not found' };

  const formRow = form as LLinkForm;
  const { data: questions, error: questionsError } = await supabase
    .from('ll_form_questions')
    .select('id, company_id, form_id, label, question_type, sort_order, is_required, options, profile_mapping, auto_tag_id, choice_tag_map')
    .eq('company_id', formRow.company_id)
    .eq('form_id', formId)
    .order('sort_order', { ascending: true });

  if (questionsError) return { data: null, error: formError('form questions fetch failed', questionsError) };

  return { data: { form: formRow, questions: (questions ?? []) as LLinkFormQuestion[] }, error: null };
}

export async function createFormFromFormData(formData: FormData): Promise<FormActionResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: 'form save failed: service role key missing' };
  if (!companyId) return { data: null, error: 'form save failed: company_id missing' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { data: null, error: 'form save failed: title missing' };

  const autoTagIds = formData.getAll('auto_tag_ids').map(String).filter(Boolean);
  const now = new Date().toISOString();
  const { data: form, error: formSaveError } = await supabase
    .from('ll_forms')
    .insert({
      company_id: companyId,
      title,
      description: String(formData.get('description') ?? '').trim(),
      status: formData.get('is_public') ? 'published' : 'draft',
      is_public: Boolean(formData.get('is_public')),
      auto_tag_ids: autoTagIds,
      updated_at: now,
    })
    .select('id')
    .single();

  if (formSaveError || !form) return { data: null, error: formError('form save failed', formSaveError) };

  const rows = Array.from({ length: 10 }, (_, index): QuestionInputRow | null => {
    const label = String(formData.get(`question_label_${index}`) ?? '').trim();
    if (!label) return null;
    return {
      company_id: companyId,
      form_id: (form as { id: string }).id,
      label,
      question_type: normalizeQuestionType(String(formData.get(`question_type_${index}`) ?? 'short_text')),
      is_required: Boolean(formData.get(`question_required_${index}`)),
      options: splitLines(String(formData.get(`question_options_${index}`) ?? '')),
      profile_mapping: normalizeProfileMapping(String(formData.get(`question_mapping_${index}`) ?? '')),
      auto_tag_id: String(formData.get(`question_tag_${index}`) ?? '') || null,
      sort_order: index,
    };
  }).filter(isQuestionInputRow);

  if (rows.length === 0) {
    const { error: questionError } = await supabase.from('ll_form_questions').insert({
      company_id: companyId,
      form_id: (form as { id: string }).id,
      label: 'お名前',
      question_type: 'short_text',
      is_required: true,
      profile_mapping: 'real_name',
      sort_order: 0,
    });
    if (questionError) return { data: null, error: formError('form question save failed', questionError) };
  } else {
    const { error: questionError } = await supabase.from('ll_form_questions').insert(rows);
    if (questionError) return { data: null, error: formError('form question save failed', questionError) };
  }

  return { data: (form as { id: string }).id, error: null };
}

export async function updateFormFromFormData(formId: string, formData: FormData): Promise<FormActionResult<string>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: 'form update failed: service role key missing' };
  if (!companyId) return { data: null, error: 'form update failed: company_id missing' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { data: null, error: 'form update failed: title missing' };

  const autoTagIds = formData.getAll('auto_tag_ids').map(String).filter(Boolean);
  const { error: formUpdateError } = await supabase
    .from('ll_forms')
    .update({
      title,
      description: String(formData.get('description') ?? '').trim(),
      status: formData.get('is_public') ? 'published' : 'draft',
      is_public: Boolean(formData.get('is_public')),
      auto_tag_ids: autoTagIds,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', formId);

  if (formUpdateError) return { data: null, error: formError('form update failed', formUpdateError) };

  const { error: deleteQuestionsError } = await supabase.from('ll_form_questions').delete().eq('company_id', companyId).eq('form_id', formId);
  if (deleteQuestionsError) return { data: null, error: formError('form questions replace failed', deleteQuestionsError) };

  const rows = Array.from({ length: 10 }, (_, index): QuestionInputRow | null => {
    const label = String(formData.get(`question_label_${index}`) ?? '').trim();
    if (!label) return null;
    return {
      company_id: companyId,
      form_id: formId,
      label,
      question_type: normalizeQuestionType(String(formData.get(`question_type_${index}`) ?? 'short_text')),
      is_required: Boolean(formData.get(`question_required_${index}`)),
      options: splitLines(String(formData.get(`question_options_${index}`) ?? '')),
      profile_mapping: normalizeProfileMapping(String(formData.get(`question_mapping_${index}`) ?? '')),
      auto_tag_id: String(formData.get(`question_tag_${index}`) ?? '') || null,
      sort_order: index,
    };
  }).filter(isQuestionInputRow);

  if (rows.length > 0) {
    const { error: insertQuestionsError } = await supabase.from('ll_form_questions').insert(rows);
    if (insertQuestionsError) return { data: null, error: formError('form questions save failed', insertQuestionsError) };
  }

  return { data: formId, error: null };
}

function answerToProfileValue(question: LLinkFormQuestion, values: string[]) {
  const value = question.question_type === 'multiple_choice' ? values.join(', ') : values[0] ?? '';
  return value.trim();
}

function isDateMapping(mapping: string | null) {
  return mapping === 'birth_date' || mapping === 'vehicle_inspection_expiry_date' || mapping === 'preferred_visit_date';
}

function isOptionMapping(mapping: string | null): mapping is FriendProfileOptionField {
  return mapping === 'customer_status'
    || mapping === 'source'
    || mapping === 'preferred_contact_method'
    || mapping === 'interest_category'
    || mapping === 'inquiry_type';
}

export async function submitPublicForm(formId: string, formData: FormData): Promise<FormActionResult<string>> {
  const supabase = createLLinkServiceClient();
  if (!supabase) return { data: null, error: 'form answer save failed: service role key missing' };

  const loaded = await getFormWithQuestions(formId, { publicOnly: true });
  if (!loaded.data) return { data: null, error: loaded.error ?? 'form answer save failed: form not found' };

  const { form, questions } = loaded.data;
  const lineUserId = String(formData.get('line_user_id') ?? '').trim() || null;
  let lineFriendId: string | null = null;

  if (lineUserId) {
    const { data: friend } = await supabase
      .from('ll_line_friends')
      .select('id')
      .eq('company_id', form.company_id)
      .eq('line_user_id', lineUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    lineFriendId = (friend as { id?: string } | null)?.id ?? null;
  }

  const answers = questions.map((question) => {
    const values = question.question_type === 'multiple_choice'
      ? formData.getAll(`question_${question.id}`).map(String).map((value) => value.trim()).filter(Boolean)
      : [String(formData.get(`question_${question.id}`) ?? '').trim()].filter(Boolean);
    return { question, values };
  });

  const missing = answers.find(({ question, values }) => question.is_required && values.length === 0);
  if (missing) return { data: null, error: `form answer save failed: ${missing.question.label} は必須です` };

  const submittedAt = new Date().toISOString();
  const { data: answerRow, error: answerError } = await supabase
    .from('ll_form_answers')
    .insert({
      company_id: form.company_id,
      form_id: form.id,
      line_friend_id: lineFriendId,
      line_user_id: lineUserId,
      source: String(formData.get('source') ?? '').trim() || 'public_form',
      submitted_at: submittedAt,
    })
    .select('id')
    .single();

  if (answerError || !answerRow) return { data: null, error: formError('form answer save failed', answerError) };

  const answerId = (answerRow as { id: string }).id;
  const itemRows = answers
    .filter(({ values }) => values.length > 0)
    .map(({ question, values }) => ({
      company_id: form.company_id,
      form_answer_id: answerId,
      question_id: question.id,
      answer_text: question.question_type === 'multiple_choice' ? values.join(', ') : values[0] ?? null,
      answer_values: values,
    }));

  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase.from('ll_form_answer_items').insert(itemRows);
    if (itemsError) return { data: null, error: formError('form answer items save failed', itemsError) };
  }

  if (lineFriendId) {
    const profileUpdate: Record<string, string | null> = {
      company_id: form.company_id,
      line_friend_id: lineFriendId,
      updated_at: submittedAt,
    };

    for (const { question, values } of answers) {
      if (!question.profile_mapping || values.length === 0) continue;
      const value = answerToProfileValue(question, values);
      if (!value) continue;
      profileUpdate[question.profile_mapping] = isDateMapping(question.profile_mapping)
        ? value || null
        : isOptionMapping(question.profile_mapping)
          ? normalizeFriendProfileOptionValue(question.profile_mapping, value)
          : value;
    }

    if (Object.keys(profileUpdate).length > 3) {
      const { error: profileError } = await supabase.from('ll_friend_profiles').upsert(profileUpdate, { onConflict: 'line_friend_id' });
      if (profileError) return { data: null, error: formError('profile upsert failed', profileError) };
    }

    const tagIds = new Set<string>((form.auto_tag_ids ?? []).filter(Boolean));
    for (const { question, values } of answers) {
      if (question.auto_tag_id && values.length > 0) tagIds.add(question.auto_tag_id);
      const choiceTagMap = question.choice_tag_map ?? {};
      for (const value of values) {
        const tagId = choiceTagMap[value];
        if (tagId) tagIds.add(tagId);
      }
    }

    if (tagIds.size > 0) {
      const rows = [...tagIds].map((tagId) => ({
        company_id: form.company_id,
        line_friend_id: lineFriendId,
        tag_id: tagId,
      }));
      const { error: tagError } = await supabase.from('ll_friend_tags').upsert(rows, { onConflict: 'company_id,line_friend_id,tag_id' });
      if (tagError) return { data: null, error: formError('tag assign failed', tagError) };
    }
  }

  return { data: answerId, error: null };
}

export async function listAnswersForForm(formId: string): Promise<FormActionResult<{ answers: LLinkFormAnswer[]; items: Map<string, LLinkFormAnswerItem[]>; questionMap: Map<string, LLinkFormQuestion> }>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: 'form answers fetch failed: service role key missing' };
  if (!companyId) return { data: null, error: 'form answers fetch failed: company_id missing' };

  const { data: answers, error: answersError } = await supabase
    .from('ll_form_answers')
    .select('id, company_id, form_id, line_friend_id, line_user_id, source, submitted_at, created_at')
    .eq('company_id', companyId)
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false });

  if (answersError) return { data: null, error: formError('form answers fetch failed', answersError) };

  const answerRows = (answers ?? []) as LLinkFormAnswer[];
  const answerIds = answerRows.map((answer) => answer.id);

  const { data: questions } = await supabase
    .from('ll_form_questions')
    .select('id, company_id, form_id, label, question_type, sort_order, is_required, options, profile_mapping, auto_tag_id, choice_tag_map')
    .eq('company_id', companyId)
    .eq('form_id', formId);
  const questionMap = new Map((questions ?? []).map((question) => [(question as LLinkFormQuestion).id, question as LLinkFormQuestion]));

  const items = new Map<string, LLinkFormAnswerItem[]>();
  if (answerIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from('ll_form_answer_items')
      .select('id, company_id, form_answer_id, question_id, answer_text, answer_values')
      .eq('company_id', companyId)
      .in('form_answer_id', answerIds);
    if (itemsError) return { data: null, error: formError('form answer items fetch failed', itemsError) };
    for (const item of (itemRows ?? []) as LLinkFormAnswerItem[]) {
      const question = item.question_id ? questionMap.get(item.question_id) : null;
      const enriched = { ...item, label: question?.label ?? null, question_type: question?.question_type ?? null };
      items.set(item.form_answer_id, [...(items.get(item.form_answer_id) ?? []), enriched]);
    }
  }

  return { data: { answers: answerRows, items, questionMap }, error: null };
}

export async function listAnswersForFriend(lineFriendId: string): Promise<FormActionResult<{ answers: LLinkFormAnswer[]; formMap: Map<string, LLinkForm>; items: Map<string, LLinkFormAnswerItem[]> }>> {
  const supabase = createLLinkServiceClient();
  const companyId = await getCurrentCompanyId();
  if (!supabase) return { data: null, error: 'friend form answers fetch failed: service role key missing' };
  if (!companyId) return { data: null, error: 'friend form answers fetch failed: company_id missing' };

  const { data: answers, error: answersError } = await supabase
    .from('ll_form_answers')
    .select('id, company_id, form_id, line_friend_id, line_user_id, source, submitted_at, created_at')
    .eq('company_id', companyId)
    .eq('line_friend_id', lineFriendId)
    .order('submitted_at', { ascending: false })
    .limit(20);

  if (answersError) return { data: null, error: formError('friend form answers fetch failed', answersError) };

  const answerRows = (answers ?? []) as LLinkFormAnswer[];
  const formIds = [...new Set(answerRows.map((answer) => answer.form_id))];
  const answerIds = answerRows.map((answer) => answer.id);
  const formMap = new Map<string, LLinkForm>();
  const items = new Map<string, LLinkFormAnswerItem[]>();

  if (formIds.length > 0) {
    const { data: forms } = await supabase
      .from('ll_forms')
      .select('id, company_id, title, description, status, is_public, auto_tag_ids, created_at, updated_at')
      .eq('company_id', companyId)
      .in('id', formIds);
    for (const form of (forms ?? []) as LLinkForm[]) formMap.set(form.id, form);
  }

  if (answerIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('ll_form_answer_items')
      .select('id, company_id, form_answer_id, question_id, answer_text, answer_values')
      .eq('company_id', companyId)
      .in('form_answer_id', answerIds);
    for (const item of (itemRows ?? []) as LLinkFormAnswerItem[]) {
      items.set(item.form_answer_id, [...(items.get(item.form_answer_id) ?? []), item]);
    }
  }

  return { data: { answers: answerRows, formMap, items }, error: null };
}
