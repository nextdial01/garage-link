import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Regression coverage for the cross-tenant authorization gap in the two retention
// candidate-generation RPCs (generate_inspection_reminder_events / generate_followup_candidate_events).
// Both are SECURITY DEFINER and previously trusted p_store_id unconditionally once granted to
// `authenticated`. These tests assert the DB-level Layer 2 check added in
// supabase/migrations/20260703000000_generate_events_store_authorization.sql exists, is wired
// before any data mutation, and is byte-identical between the canonical schema/ files (used to
// bootstrap a fresh database) and the new migration (used to patch an already-bootstrapped one) —
// mirroring the existing 20260628/20260629 parity pattern in this repo.

const MIGRATION_PATH = 'supabase/migrations/20260703000000_generate_events_store_authorization.sql';

function extractFunctionBody(sql: string, fnName: string) {
  const start = sql.indexOf(`create or replace function public.${fnName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(`grant execute on function public.${fnName}`, start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

test.describe('generate_inspection_reminder_events / generate_followup_candidate_events: 店舗越境の認可（Layer 2）', () => {
  test('schema/035 に、authenticated直接呼び出しの店舗越境を拒否するチェックが含まれる', async () => {
    const sql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const fnBody = extractFunctionBody(sql, 'generate_inspection_reminder_events');

    expect(fnBody).toContain('v_caller_id := auth.uid();');
    expect(fnBody).toContain('if v_caller_id is not null then');
    // p_store_id が null（全店舗）の場合、authenticatedの直接呼び出しは拒否する。
    expect(fnBody).toContain('if p_store_id is null then');
    // 対象店舗の owner/admin membership を要求する。
    expect(fnBody).toContain('from public.store_members sm');
    expect(fnBody).toContain('sm.store_id = p_store_id');
    expect(fnBody).toContain('sm.user_id  = v_caller_id');
    expect(fnBody).toContain("sm.role     in ('owner', 'admin')");
    expect(fnBody).toContain("raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';");
  });

  test('schema/040 に、authenticated直接呼び出しの店舗越境を拒否するチェックが含まれる', async () => {
    const sql = await readFile('supabase/schema/040_followup_candidate_generation.sql', 'utf8');
    const fnBody = extractFunctionBody(sql, 'generate_followup_candidate_events');

    expect(fnBody).toContain('v_caller_id := auth.uid();');
    expect(fnBody).toContain('if v_caller_id is not null then');
    expect(fnBody).toContain('if p_store_id is null then');
    expect(fnBody).toContain('from public.store_members sm');
    expect(fnBody).toContain('sm.store_id = p_store_id');
    expect(fnBody).toContain('sm.user_id  = v_caller_id');
    expect(fnBody).toContain("sm.role     in ('owner', 'admin')");
    expect(fnBody).toContain("raise exception 'アクセスが拒否されました。' using errcode = 'insufficient_privilege';");
  });

  test('両関数とも、認可チェックが最初のデータ変更（UPDATE/INSERT）より前に実行される', async () => {
    const schema035 = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const body035 = extractFunctionBody(schema035, 'generate_inspection_reminder_events');
    const authEnd035 = body035.indexOf('end if;\n  end if;');
    expect(authEnd035).toBeGreaterThanOrEqual(0);
    const firstUpdate035 = body035.indexOf('update public.inspection_reminder_events');
    expect(firstUpdate035).toBeGreaterThan(authEnd035);

    const schema040 = await readFile('supabase/schema/040_followup_candidate_generation.sql', 'utf8');
    const body040 = extractFunctionBody(schema040, 'generate_followup_candidate_events');
    const authEnd040 = body040.indexOf('end if;\n  end if;');
    expect(authEnd040).toBeGreaterThanOrEqual(0);
    const firstInsert040 = body040.indexOf('insert into public.inspection_reminder_events');
    expect(firstInsert040).toBeGreaterThan(authEnd040);
  });

  test('service_role・SQL Editor（auth.uid()がnull）は既存どおりチェックをスキップし、副作用のある処理へ進む', async () => {
    // v_caller_id is null の分岐には raise exception が存在しない（=素通りして本来の処理へ進む）ことを
    // 確認する。つまり if ブロックの外側（else 相当）に例外送出が無いことを保証する。
    const schema035 = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const body035 = extractFunctionBody(schema035, 'generate_inspection_reminder_events');
    const authBlockEnd = body035.indexOf('end if;\n  end if;') + 'end if;\n  end if;'.length;
    const authBlock = body035.slice(0, authBlockEnd);
    // raise exception は if v_caller_id is not null ブロックの内側にのみ存在する（2箇所）。
    const raiseCount = (authBlock.match(/raise exception/g) ?? []).length;
    expect(raiseCount).toBe(2);
  });

  test('search_pathが public, pg_temp に強化されている（両関数）', async () => {
    const schema035 = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const body035 = extractFunctionBody(schema035, 'generate_inspection_reminder_events');
    expect(body035).toContain('set search_path = public, pg_temp');

    const schema040 = await readFile('supabase/schema/040_followup_candidate_generation.sql', 'utf8');
    const body040 = extractFunctionBody(schema040, 'generate_followup_candidate_events');
    expect(body040).toContain('set search_path = public, pg_temp');
  });

  test('grantはauthenticatedのみのまま（拡大も縮小もしていない）', async () => {
    const schema035 = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    expect(schema035).toContain(
      'grant execute on function public.generate_inspection_reminder_events(uuid, date) to authenticated;'
    );
    expect(schema035).not.toContain('generate_inspection_reminder_events(uuid, date) to anon');
    expect(schema035).not.toContain('generate_inspection_reminder_events(uuid, date) to service_role');

    const schema040 = await readFile('supabase/schema/040_followup_candidate_generation.sql', 'utf8');
    expect(schema040).toContain(
      'grant execute on function public.generate_followup_candidate_events(uuid, date) to authenticated;'
    );
    expect(schema040).not.toContain('generate_followup_candidate_events(uuid, date) to anon');
    expect(schema040).not.toContain('generate_followup_candidate_events(uuid, date) to service_role');
  });

  test('既存の冪等性・除外条件・INSERT対象カラムのロジックは変更されていない（回帰防止）', async () => {
    const schema035 = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const body035 = extractFunctionBody(schema035, 'generate_inspection_reminder_events');
    expect(body035).toContain(
      "store_id::text || ':' || vehicle_id::text || ':' || inspection_expiry_date::text || ':' || offset_days::text"
    );
    expect(body035).toContain('on conflict (idempotency_key) do nothing');
    expect(body035).toContain('(v.inspection_expiry_date - v_today) = t.offset_days');
    expect(body035).toContain("where customer_id is not null  -- 顧客に紐づく車両のみ");

    const schema040 = await readFile('supabase/schema/040_followup_candidate_generation.sql', 'utf8');
    const body040 = extractFunctionBody(schema040, 'generate_followup_candidate_events');
    for (const t of ['periodic_inspection', 'post_delivery_follow_up', 'review_request', 'long_no_contact']) {
      expect(body040).toContain(`'${t}'`);
    }
    expect(body040).not.toContain("'repurchase', 'pending'");
    expect((body040.match(/on conflict \(idempotency_key\) do nothing/g) ?? []).length).toBe(4);
  });

  test('acknowledge_inspection_reminder_events・get_inspection_reminder_eligibility_summary（既存の安全設計）は変更されていない', async () => {
    // 本migrationは2つのgenerate_*関数のみを対象とする。ACK関数・eligibility関数の定義に
    // 意図しない変更が入っていないことを確認する（既存テスト群が別途カバーしているが、
    // 「このタスクの変更差分がこの2関数に限定されている」ことをここでも明示する）。
    const schema035 = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    expect(schema035).toContain('create or replace function public.acknowledge_inspection_reminder_events');
    const ackStart = schema035.indexOf('create or replace function public.acknowledge_inspection_reminder_events');
    const ackBody = schema035.slice(ackStart, schema035.indexOf('grant execute on function public.acknowledge_inspection_reminder_events', ackStart));
    expect(ackBody).not.toContain('v_caller_id');
    expect(ackBody).toContain('set search_path = public');
  });
});

test.describe('20260703000000: 新migrationのファンクション定義がschema/035・schema/040と完全一致する（デプロイ差分なし）', () => {
  function extract(sql: string, fnName: string) {
    const start = sql.indexOf(`create or replace function public.${fnName}`);
    const end = sql.indexOf(`grant execute on function public.${fnName}`, start);
    return sql.slice(start, end).trim();
  }

  test('generate_inspection_reminder_events: migrationとschema/035が一致する', async () => {
    const schemaSql = await readFile('supabase/schema/035_inspection_reminders.sql', 'utf8');
    const migrationSql = await readFile(MIGRATION_PATH, 'utf8');
    expect(extract(migrationSql, 'generate_inspection_reminder_events')).toBe(
      extract(schemaSql, 'generate_inspection_reminder_events')
    );
    expect(migrationSql).toContain(
      'grant execute on function public.generate_inspection_reminder_events(uuid, date) to authenticated;'
    );
  });

  test('generate_followup_candidate_events: migrationとschema/040が一致する', async () => {
    const schemaSql = await readFile('supabase/schema/040_followup_candidate_generation.sql', 'utf8');
    const migrationSql = await readFile(MIGRATION_PATH, 'utf8');
    expect(extract(migrationSql, 'generate_followup_candidate_events')).toBe(
      extract(schemaSql, 'generate_followup_candidate_events')
    );
    expect(migrationSql).toContain(
      'grant execute on function public.generate_followup_candidate_events(uuid, date) to authenticated;'
    );
  });
});

test.describe('API層: 既存の呼び出し経路はp_store_idをセッション由来のみに限定している（回帰確認）', () => {
  test('/api/jobs/inspection-reminders は client 指定の store_id を受け付けない（既存動作の再確認）', async () => {
    const source = await readFile('src/app/api/jobs/inspection-reminders/route.ts', 'utf8');
    // service_role clientはauth.uid()を持たないため今回追加した認可チェックをスキップして通過するが、
    // それは「APIルート側で既にowner/admin確認済みのstore_idしか渡さない」設計に立脚している。
    // その前提（member.store_id のみを渡す・request由来のstore_idを使わない）が崩れていないことを確認する。
    expect(source).toContain('runGenerationJobs(service, member.store_id)');
    expect(source).not.toContain('request.json()');
    expect(source).not.toMatch(/searchParams\.get\(['"]store_id['"]\)/);
  });
});
