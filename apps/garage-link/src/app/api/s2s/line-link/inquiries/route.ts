import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyLLinkS2SRequest } from '@/lib/line-link/s2sAuth';
import { logServerError } from '@/lib/observability/logServerError';
import { canStoreUseLLink } from '@/lib/billing/lLinkContract';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_ANSWERS = 50;
const MAX_LABEL_LENGTH = 120;
const MAX_VALUE_LENGTH = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InquiryBody = {
  response_id: string;
  form_id: string;
  form_title: string;
  submitted_at: string;
  source: string;
  answers: Record<string, string | string[]>;
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function markLLinkConnected(supabase: NonNullable<ReturnType<typeof createServiceClient>>, storeId: string) {
  const { error } = await supabase
    .from('stores')
    .update({ l_link_onboarding_completed_at: new Date().toISOString() })
    .eq('id', storeId)
    .is('l_link_onboarding_completed_at', null);
  if (error) {
    logServerError('l_link_connection_flag_update_failed', {
      route: 's2s/line-link/inquiries',
      storeId,
      details: { db_error_code: error.code ?? 'unknown', db_error_stage: 'mark_connected' },
    });
  }
}

function boundedText(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
    ? value.trim()
    : null;
}

function parseBody(bodyText: string): InquiryBody | null {
  if (!bodyText || Buffer.byteLength(bodyText, 'utf8') > MAX_BODY_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const responseId = boundedText(body.response_id, 36);
  const formId = boundedText(body.form_id, 36);
  const formTitle = boundedText(body.form_title, 160);
  const source = boundedText(body.source, 80) ?? 'public_form';
  const submittedAt = boundedText(body.submitted_at, 40);
  if (!responseId || !formId || !UUID_RE.test(responseId) || !UUID_RE.test(formId) || !formTitle || !submittedAt) return null;
  const parsedDate = new Date(submittedAt);
  if (!Number.isFinite(parsedDate.getTime())) return null;
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return null;
  const entries = Object.entries(body.answers as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_ANSWERS) return null;
  const answers: Record<string, string | string[]> = {};
  for (const [rawLabel, rawAnswer] of entries) {
    const label = boundedText(rawLabel, MAX_LABEL_LENGTH);
    if (!label) return null;
    if (typeof rawAnswer === 'string') {
      if (rawAnswer.length > MAX_VALUE_LENGTH) return null;
      answers[label] = rawAnswer;
      continue;
    }
    if (!Array.isArray(rawAnswer) || rawAnswer.length > 30) return null;
    const values = rawAnswer.map((item) => boundedText(item, MAX_VALUE_LENGTH));
    if (values.some((item) => item === null)) return null;
    answers[label] = values as string[];
  }
  return {
    response_id: responseId,
    form_id: formId,
    form_title: formTitle,
    submitted_at: parsedDate.toISOString(),
    source,
    answers,
  };
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const url = new URL(request.url);
  const auth = await verifyLLinkS2SRequest({
    method: 'POST',
    path: url.pathname,
    headers: request.headers,
    body: bodyText,
  });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.code }, { status: auth.status });
  }
  if (!(await canStoreUseLLink(auth.storeId))) {
    return NextResponse.json({ ok: false, code: 'plan_required', error: 'L-LINK連携はStandard以上の契約が必要です。' }, { status: 403 });
  }

  const body = parseBody(bodyText);
  if (!body) {
    return NextResponse.json({ ok: false, code: 'invalid_body', error: '問い合わせデータの形式が不正です。' }, { status: 400 });
  }
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, code: 'server_misconfigured', error: '問い合わせ連携のサーバー設定が不足しています。' }, { status: 500 });
  }

  try {
    const { data: existing, error: existingError } = await supabase
      .from('line_form_responses')
      .select('id')
      .eq('store_id', auth.storeId)
      .eq('external_source', 'l-link')
      .eq('external_response_id', body.response_id)
      .maybeSingle();
    if (existingError) {
      logServerError('l_link_inquiry_lookup_failed', {
        route: 's2s/line-link/inquiries',
        storeId: auth.storeId,
        details: { db_error_code: existingError.code ?? 'unknown', db_error_stage: 'lookup' },
      });
      throw existingError;
    }
    if (existing?.id) {
      await markLLinkConnected(supabase, auth.storeId);
      return NextResponse.json({ ok: true, store_id: auth.storeId, inquiry_id: existing.id, outcome: 'already_exists' });
    }

    const { data: created, error: createError } = await supabase
      .from('line_form_responses')
      .insert({
        store_id: auth.storeId,
        answers: body.answers,
        submitted_at: body.submitted_at,
        source_route: `L-LINK / ${body.form_title}`.slice(0, 240),
        external_source: 'l-link',
        external_response_id: body.response_id,
        external_form_id: body.form_id,
      })
      .select('id')
      .single();
    if (createError) {
      if (createError.code === '23505') {
        const { data: duplicate } = await supabase
          .from('line_form_responses')
          .select('id')
          .eq('store_id', auth.storeId)
          .eq('external_source', 'l-link')
          .eq('external_response_id', body.response_id)
          .maybeSingle();
        if (duplicate?.id) {
          await markLLinkConnected(supabase, auth.storeId);
          return NextResponse.json({ ok: true, store_id: auth.storeId, inquiry_id: duplicate.id, outcome: 'already_exists' });
        }
      }
      logServerError('l_link_inquiry_insert_failed', {
        route: 's2s/line-link/inquiries',
        storeId: auth.storeId,
        details: { db_error_code: createError.code ?? 'unknown', db_error_stage: 'insert' },
      });
      throw createError;
    }
    await markLLinkConnected(supabase, auth.storeId);
    return NextResponse.json({ ok: true, store_id: auth.storeId, inquiry_id: created.id, outcome: 'created' }, { status: 201 });
  } catch (error) {
    logServerError('l_link_inquiry_sync_failed', { route: 's2s/line-link/inquiries', storeId: auth.storeId }, error);
    return NextResponse.json({ ok: false, code: 'internal_error', error: '問い合わせの登録に失敗しました。' }, { status: 500 });
  }
}
