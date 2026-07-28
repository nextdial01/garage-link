import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const migrationPath = 'supabase/migrations/20260727000100_active_store_preference.sql';

test.describe('G1-D active store preference', () => {
  test('assignment単独では権限を付与せずactive membershipとactive storeを必須にする', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('create table if not exists public.membership_store_assignments');
    expect(sql).toContain('unique (membership_id, store_id)');
    expect(sql).toContain('create or replace function public.current_user_can_access_store');
    expect(sql).toMatch(/m\.status\s*=\s*'active'/);
    expect(sql).toMatch(/m\.disabled_at\s+is\s+null/);
    expect(sql).toMatch(/m\.deleted_at\s+is\s+null/);
    expect(sql).toContain('public.store_is_authorization_eligible(s.status)');
    expect(sql).not.toContain('join public.stores assigned_store');
    expect(sql).toContain('create or replace view public.current_user_active_store_membership');
    expect(sql).toContain('with (security_invoker=true, security_barrier=true)');
    expect(sql).not.toContain('public.store_members sm');
  });

  test('switch RPCはpreferenceだけをupsertしmembershipと業務scopeを変更しない', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const switchBody = sql.slice(sql.indexOf('create or replace function public.switch_active_garage_store'));

    expect(switchBody).toContain('insert into public.user_active_store_preferences');
    expect(switchBody).toContain("on conflict (user_id, tenant_id) do update");
    expect(switchBody).not.toMatch(/update\s+public\.memberships/i);
    expect(switchBody).not.toMatch(/update\s+public\.store_members/i);
    expect(switchBody).not.toMatch(/update\s+public\.(vehicles|customers|deals|quotes|invoices)/i);
  });

  test('preferenceは本人限定RLS・複合scope・最小EXECUTEを持つ', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('alter table public.user_active_store_preferences enable row level security');
    expect(sql).toContain('using (user_id = auth.uid())');
    expect(sql).toContain('with check (user_id = auth.uid())');
    expect(sql).toContain('foreign key (active_store_id, tenant_id)');
    expect(sql).toContain('set search_path = public, pg_temp');
    expect(sql).toContain('grant execute on function public.switch_active_garage_store(uuid, uuid, text) to authenticated');
    expect(sql).not.toContain('grant execute on function public.switch_active_garage_store(uuid, uuid, text) to anon');
  });

  test('店舗切替APIはsession actorとserver生成correlation IDで新RPCだけを呼ぶ', async () => {
    const route = await readFile('src/app/api/stores/active/route.ts', 'utf8');

    expect(route).toContain('supabase.auth.getUser()');
    expect(route).toContain('crypto.randomUUID()');
    expect(route).toContain("rpc('switch_active_garage_store'");
    expect(route).toContain('p_tenant_id: tenantId');
    expect(route).toContain('p_store_id: storeId');
    expect(route).not.toContain('actorUserId');
    expect(route).not.toContain('user_id');
  });

  test('store selectorはAPI経由で切替え、旧データを遮蔽して複数タブへ通知する', async () => {
    const [shell, context] = await Promise.all([
      readFile('src/components/AppShell.tsx', 'utf8'),
      readFile('src/lib/store/garageUiContext.ts', 'utf8'),
    ]);

    expect(shell).toContain("fetch('/api/stores/active'");
    expect(shell).not.toContain("rpc('switch_active_garage_store'");
    expect(shell).toContain('店舗を切り替えています');
    expect(shell).toContain('storeSwitchError');
    expect(shell).toContain('notifyGarageStoreSwitch');
    expect(context).toContain("rpc('get_garage_ui_context_v2'");
    expect(context).toContain('BroadcastChannel');
    expect(context).toContain("addEventListener('storage'");
  });

  test('共通権限・ログイン後遷移・主要集計は旧membership.store_idをactive storeとして扱わない', async () => {
    const [permissions, redirect, dashboard, analytics, feed] = await Promise.all([
      readFile('src/lib/auth/permissions.ts', 'utf8'),
      readFile('src/lib/auth/post-auth-redirect.ts', 'utf8'),
      readFile('src/app/dashboard/page.tsx', 'utf8'),
      readFile('src/app/analytics/page.tsx', 'utf8'),
      readFile('src/app/api/vehicles/feed/route.ts', 'utf8'),
    ]);

    expect(permissions).toContain('requireActiveGarageStore');
    expect(permissions).not.toContain(".from<StoreMemberRow>('memberships')");
    expect(redirect).toContain("'get_garage_ui_context_v2'");
    expect(redirect).not.toContain(".select('store_id')");
    expect(dashboard).toContain("rpc('get_garage_dashboard_payload_v2'");
    expect(analytics).toContain("rpc('get_garage_analytics_payload_v2'");
    expect(feed).toContain("rpc('get_garage_ui_context_v2'");
  });

  test('選択が必要な間は業務画面を描画せずonboardingへ誤転送しない', async () => {
    const [shell, middleware] = await Promise.all([
      readFile('src/components/AppShell.tsx', 'utf8'),
      readFile('src/middleware.ts', 'utf8'),
    ]);

    expect(shell).toContain("context.state === 'active' && !context.onboardingCompleted");
    expect(shell).toContain("storeContextState === 'selection_required'");
    expect(shell).toContain('操作する店舗を選択してください');
    expect(shell).toContain("storeContextState === 'no_access'");
    expect(middleware).toContain("postAuthPath.split('?')[0] === pathname");
    expect(middleware).toContain("pathname.startsWith('/api/')");
    expect(middleware).toContain("{ error: 'forbidden' }, { status: 403 }");
  });
});
