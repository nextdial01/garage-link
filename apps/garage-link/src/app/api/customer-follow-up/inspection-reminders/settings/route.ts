import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/observability/logServerError';
import {
  DEFAULT_TIMINGS,
  validateTimings,
  type ReminderSettings,
  type ReminderTiming,
} from '@/lib/inspection-reminders/shared';

type StoreMemberRow = { store_id: string; role: string | null };
type SettingsRow = {
  enabled: boolean | null;
  exclude_sold: boolean | null;
  exclude_scrapped: boolean | null;
  exclude_reserved_or_in_service: boolean | null;
  require_customer_link: boolean | null;
};

function canManage(role: string | null) {
  return role === 'owner' || role === 'admin';
}

async function getContext() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.id) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。', code: 'unauthorized' }, { status: 401 }) };
  }
  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();
  if (memberError || !member?.store_id) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。', code: 'forbidden_no_membership' }, { status: 403 }) };
  }
  if (!canManage(member.role)) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: '権限がありません。', code: 'forbidden_role' }, { status: 403 }) };
  }
  // service_role はこのプロジェクトで権限を絞られており inspection_* テーブルにアクセスできないため、
  // 認証ユーザーのセッション（RLS: 所属店舗のみ・変更は owner/admin のみ）でアクセスする。
  return { ok: true as const, supabase, storeId: member.store_id, userId: userData.user.id };
}

export async function GET() {
  const ctx = await getContext();
  if (!ctx.ok) return ctx.response;

  try {
    // テーブル不在・RLSエラー・接続エラーは握り潰さない（error を必ず確認して throw）。
    // レコードが無い「正常な未設定」ケースのみ、初期表示用のデフォルトにフォールバックする。
    const { data: settingsRow, error: settingsError } = await ctx.supabase
      .from<SettingsRow>('inspection_reminder_settings')
      .select('enabled, exclude_sold, exclude_scrapped, exclude_reserved_or_in_service, require_customer_link')
      .eq('store_id', ctx.storeId)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    const { data: timingRows, error: timingError } = await ctx.supabase
      .from<ReminderTiming>('inspection_reminder_timings')
      .select('offset_days, enabled')
      .eq('store_id', ctx.storeId)
      .order('offset_days', { ascending: true });
    if (timingError) throw new Error(timingError.message);

    const settings: ReminderSettings = {
      enabled: settingsRow?.enabled ?? false,
      exclude_sold: settingsRow?.exclude_sold ?? true,
      exclude_scrapped: settingsRow?.exclude_scrapped ?? true,
      exclude_reserved_or_in_service: settingsRow?.exclude_reserved_or_in_service ?? true,
      require_customer_link: settingsRow?.require_customer_link ?? true,
      timings: (timingRows as ReminderTiming[] | null)?.length ? (timingRows as ReminderTiming[]) : DEFAULT_TIMINGS,
    };
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    logServerError('inspection_settings_read_failed', { route: 'inspection-reminders/settings', method: 'GET', storeId: ctx.storeId }, error);
    return NextResponse.json({ ok: false, error: '設定の取得に失敗しました。', code: 'inspection_settings_read_failed' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const ctx = await getContext();
  if (!ctx.ok) return ctx.response;

  let body: ReminderSettings;
  try {
    body = (await request.json()) as ReminderSettings;
  } catch {
    return NextResponse.json({ ok: false, error: 'リクエスト形式が正しくありません。', code: 'invalid_request' }, { status: 400 });
  }

  const timings = Array.isArray(body.timings) ? body.timings : [];
  const validation = validateTimings(timings);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, error: validation.error, code: 'invalid_timings' }, { status: 400 });
  }

  try {
    const { error: upsertError } = await ctx.supabase
      .from('inspection_reminder_settings')
      .upsert(
        {
          store_id: ctx.storeId,
          enabled: Boolean(body.enabled),
          exclude_sold: Boolean(body.exclude_sold),
          exclude_scrapped: Boolean(body.exclude_scrapped),
          exclude_reserved_or_in_service: Boolean(body.exclude_reserved_or_in_service),
          require_customer_link: Boolean(body.require_customer_link),
          updated_by: ctx.userId,
        },
        { onConflict: 'store_id' }
      );
    if (upsertError) throw new Error('settings upsert failed');

    // タイミングは全置換で同期（重複・削除・追加・編集をまとめて反映）。
    const { error: deleteError } = await ctx.supabase
      .from('inspection_reminder_timings')
      .delete()
      .eq('store_id', ctx.storeId);
    if (deleteError) throw new Error('timings delete failed');

    if (validation.timings.length > 0) {
      const rows = validation.timings.map((timing) => ({
        store_id: ctx.storeId,
        offset_days: timing.offset_days,
        enabled: Boolean(timing.enabled),
      }));
      const { error: insertError } = await ctx.supabase.from('inspection_reminder_timings').insert(rows);
      if (insertError) throw new Error('timings insert failed');
    }

    return NextResponse.json({ ok: true, settings: { ...body, timings: validation.timings } });
  } catch (error) {
    logServerError('inspection_settings_save_failed', { route: 'inspection-reminders/settings', method: 'PUT', storeId: ctx.storeId }, error);
    return NextResponse.json({ ok: false, error: '設定の保存に失敗しました。', code: 'inspection_settings_save_failed' }, { status: 500 });
  }
}
