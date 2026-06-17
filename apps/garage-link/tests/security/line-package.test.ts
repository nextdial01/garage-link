import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.describe('LINE package UI security contracts', () => {
  test('友だち一覧はline_user_idやraw_eventを取得・表示しない', async () => {
    const [pageSource, adapterSource] = await Promise.all([
      readFile('src/app/line-package/friends/page.tsx', 'utf8'),
      readFile('src/lib/line/adapters/linePackageAdapter.ts', 'utf8'),
    ]);

    expect(pageSource).not.toContain('line_user_id');
    expect(pageSource).not.toContain('raw_event');
    expect(adapterSource).not.toContain('line_user_id');
    expect(adapterSource).not.toContain('raw_event');
    expect(adapterSource).toContain('line_display_name');
    expect(adapterSource).toContain('tag_names');
  });

  test('LINE単体設定画面はSecret暗号文を扱わず、マスク表示Fieldを使う', async () => {
    const source = await readFile('src/app/line-package/settings/page.tsx', 'utf8');
    const stateSource = source.slice(
      source.indexOf('type SafeLineSettings'),
      source.indexOf('type ApiResponse')
    );

    expect(source).toContain('LineSecretField');
    expect(stateSource).toContain('channel_secret_masked');
    expect(stateSource).toContain('channel_access_token_masked');
    expect(stateSource).not.toContain('channel_secret_encrypted');
    expect(stateSource).not.toContain('channel_access_token_encrypted');
  });

  test('LINE単体ShellはGARAGE LINK本体Shellや本体専用hrefに依存しない', async () => {
    const [shellSource, sidebarSource] = await Promise.all([
      readFile('src/components/line-package/LinePackageShell.tsx', 'utf8'),
      readFile('src/components/line-package/LinePackageSidebar.tsx', 'utf8'),
    ]);

    expect(shellSource).not.toContain('AppShell');
    expect(sidebarSource).not.toMatch(/href: '\/vehicles'/);
    expect(sidebarSource).not.toMatch(/href: '\/customers'/);
    expect(sidebarSource).not.toMatch(/href: '\/deals'/);
    expect(sidebarSource).not.toMatch(/href: '\/maintenance'/);
    expect(sidebarSource).not.toMatch(/href: '\/quotes'/);
    expect(sidebarSource).not.toMatch(/href: '\/invoices'/);
  });

  test('メッセージ画面は本配信をowner/adminのみに絞る', async () => {
    const source = await readFile('src/app/line-package/messages/page.tsx', 'utf8');

    expect(source).toContain("role === 'owner' || role === 'admin'");
    expect(source).toContain('LineDeliveryConfirmPanel');
    expect(source).toContain('canExecuteDelivery={canExecuteDelivery}');
  });
});
