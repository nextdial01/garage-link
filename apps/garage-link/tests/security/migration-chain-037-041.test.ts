import { readdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Regression coverage for the migration-chain defect: schema/037-041 previously existed only
// under supabase/schema/ (the source used to bootstrap a fresh database), with no corresponding
// file under supabase/migrations/ (the directory `supabase db push` actually replays in order).
// 20260702000000 and 20260703000000 depend on schema/037/039/040, which made a plain
// `supabase db push` invalid on an already-035-bootstrapped database: it would jump straight from
// 20260629000000 to 20260702000000 without ever creating the objects 20260702/20260703 rely on.
//
// These tests assert: the five promoted migration files exist, sort in the correct position and
// dependency order, and remain byte-identical (modulo the promotion header comment) to the
// schema/ files they promote — so a future edit to a schema/ file cannot silently drift from what
// `supabase db push` would actually deploy.

const MIGRATIONS_DIR = 'supabase/migrations';

const PROMOTIONS: Array<{ migration: string; schema: string; marker: string }> = [
  {
    migration: '20260630000000_delivery_candidate_event_types.sql',
    schema: 'supabase/schema/037_delivery_candidate_event_types.sql',
    marker: '-- 037 配信候補イベント種別の拡張（L-LINK連携基盤・前方互換）',
  },
  {
    migration: '20260630000100_stock_movements_and_invoice_sale.sql',
    schema: 'supabase/schema/038_stock_movements_and_invoice_sale.sql',
    marker: '-- 038 在庫変動履歴 ＋ 請求書（整備案件に紐付かない部品単品販売）の在庫確定/取消',
  },
  {
    migration: '20260630000200_customer_deal_followup_fields.sql',
    schema: 'supabase/schema/039_customer_deal_followup_fields.sql',
    marker: '-- 039 顧客・商談の再来店/フォロー用フィールド追加（Phase 3）',
  },
  {
    migration: '20260701000000_followup_candidate_generation.sql',
    schema: 'supabase/schema/040_followup_candidate_generation.sql',
    marker: '-- 040 配信候補イベント生成（Phase 4: 点検/納車後フォロー/口コミ/長期未接触）',
  },
  {
    migration: '20260701000100_inventory_profit_turnover.sql',
    schema: 'supabase/schema/041_inventory_profit_turnover.sql',
    marker: '-- 041 在庫利益・回転（Phase 2）',
  },
];

test.describe('migration chain: 037-041 promoted to supabase/migrations/', () => {
  test('5つの新規migrationファイルがすべて存在する', async () => {
    const files = await readdir(MIGRATIONS_DIR);
    for (const { migration } of PROMOTIONS) {
      expect(files).toContain(migration);
    }
  });

  test('既存の historical migration ファイルはリネーム・削除されていない', async () => {
    const files = await readdir(MIGRATIONS_DIR);
    const untouched = [
      '20260625000000_line_link_inbound_nonces.sql',
      '20260625000100_line_link_s2s_service_role_grants.sql',
      '20260627000000_inspection_reminder_eligibility_fn.sql',
      '20260628000000_inspection_reminder_stale_event_invalidation.sql',
      '20260629000000_inspection_reminder_ack_fn.sql',
      '20260702000000_inspection_reminder_eligibility_scope_event_type.sql',
      '20260703000000_generate_events_store_authorization.sql',
    ];
    for (const f of untouched) {
      expect(files).toContain(f);
    }
  });

  test('新5ファイルのタイムスタンプは 20260629000000 より後、20260702000000 より前でソートされる', async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const lowerBound = '20260629000000_inspection_reminder_ack_fn.sql';
    const upperBound = '20260702000000_inspection_reminder_eligibility_scope_event_type.sql';
    const lowerIdx = files.indexOf(lowerBound);
    const upperIdx = files.indexOf(upperBound);
    expect(lowerIdx).toBeGreaterThanOrEqual(0);
    expect(upperIdx).toBeGreaterThan(lowerIdx);

    for (const { migration } of PROMOTIONS) {
      const idx = files.indexOf(migration);
      expect(idx).toBeGreaterThan(lowerIdx);
      expect(idx).toBeLessThan(upperIdx);
    }
  });

  test('新5ファイルは 037→038→039→040→041 の依存順で正しくソートされる（辞書順=タイムスタンプ順）', async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const indices = PROMOTIONS.map(({ migration }) => files.indexOf(migration));
    for (const idx of indices) expect(idx).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  test('20260702000000・20260703000000 は新5ファイルより後にソートされる（依存関係を満たす）', async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const lastPromotedIdx = files.indexOf('20260701000100_inventory_profit_turnover.sql');
    const idx20260702 = files.indexOf('20260702000000_inspection_reminder_eligibility_scope_event_type.sql');
    const idx20260703 = files.indexOf('20260703000000_generate_events_store_authorization.sql');
    expect(idx20260702).toBeGreaterThan(lastPromotedIdx);
    expect(idx20260703).toBeGreaterThan(idx20260702);
  });

  for (const { migration, schema, marker } of PROMOTIONS) {
    test(`${migration}: SQL本体が ${schema} と完全一致する（プロモーション用ヘッダーを除く）`, async () => {
      const schemaSql = await readFile(schema, 'utf8');
      const migrationSql = await readFile(`${MIGRATIONS_DIR}/${migration}`, 'utf8');
      const markerIdx = migrationSql.indexOf(marker);
      expect(markerIdx).toBeGreaterThan(0); // header must precede the promoted body
      const migrationBody = migrationSql.slice(markerIdx);
      expect(migrationBody).toBe(schemaSql);
    });

    test(`${migration}: プロモーション用ヘッダーが対応するschemaファイルを明示している`, async () => {
      const migrationSql = await readFile(`${MIGRATIONS_DIR}/${migration}`, 'utf8');
      expect(migrationSql).toContain(schema);
    });
  }
});

test.describe('migration chain: 20260702000000 / 20260703000000 の依存が新5ファイルで満たされる', () => {
  test('20260702000000（eligibility の event_type 絞り込み）は inspection_reminder_events.event_type 列を前提にするのみで、037-041固有の新規オブジェクト（関数・制約）を呼び出していない', async () => {
    // 20260702000000 は 035由来のevent_type列を参照するだけで、037が追加したCHECK制約や
    // 040が追加した関数を呼び出してはいない（呼び出していれば037/040が先に無いと壊れてしまうため、
    // 「037-041のどこに置いても安全」という前提が崩れる）。コメントで種別名（periodic_inspection等）に
    // 触れることはあっても、CREATE/ALTER/CALL の対象にはしていないことを確認する。
    const sql = await readFile(
      `${MIGRATIONS_DIR}/20260702000000_inspection_reminder_eligibility_scope_event_type.sql`,
      'utf8'
    );
    expect(sql).toContain("e.event_type = 'inspection_reminder'");
    // Comments may reference the other event types for rationale, but this file must not
    // itself define/alter the CHECK constraint or call the 040 function — those remain the
    // sole responsibility of 037 and 040/20260703 respectively.
    expect(sql).not.toContain('add constraint inspection_reminder_events_type_check');
    expect(sql).not.toMatch(/select\s+public\.generate_followup_candidate_events/);
  });

  test('20260703000000（店舗越境認可）は generate_followup_candidate_events を patch しており、040由来の関数が先に存在している前提を明示している', async () => {
    const sql = await readFile(
      `${MIGRATIONS_DIR}/20260703000000_generate_events_store_authorization.sql`,
      'utf8'
    );
    expect(sql).toContain('create or replace function public.generate_followup_candidate_events');
    // 040 promotion (20260701000000) already contains the identical authorization block; this
    // migration is a byte-identical no-op re-application for that specific function but remains
    // essential for generate_inspection_reminder_events (schema/035, applied separately/earlier).
    const followupBody040 = (
      await readFile(`${MIGRATIONS_DIR}/20260701000000_followup_candidate_generation.sql`, 'utf8')
    );
    expect(followupBody040).toContain('v_caller_id := auth.uid();');
  });

  test('040 promotion（20260701000000）は037拡張後のCHECK制約前提と039のcustomers.last_contact_atに依存すると明記している', async () => {
    const sql = await readFile(`${MIGRATIONS_DIR}/20260701000000_followup_candidate_generation.sql`, 'utf8');
    expect(sql).toContain('20260630000000');
    expect(sql).toContain('20260630000200');
    expect(sql).toContain('c.last_contact_at');
  });
});
