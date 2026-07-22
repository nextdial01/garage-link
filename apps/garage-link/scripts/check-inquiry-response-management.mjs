import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const [migration, inquiriesPage, dashboardPage, sidebar, inquiryApi] = await Promise.all([
  read('supabase/migrations/20260718000300_inquiry_response_management.sql'),
  read('src/app/inquiries/page.tsx'),
  read('src/app/dashboard/page.tsx'),
  read('src/components/AppSidebar.tsx'),
  read('src/app/api/s2s/line-link/inquiries/route.ts'),
]);

for (const field of ['response_status', 'assigned_user_name', 'next_action_at']) {
  assert.match(migration, new RegExp(field), `migration must add ${field}`);
  assert.match(inquiriesPage, new RegExp(field), `inquiry page must use ${field}`);
  assert.match(dashboardPage, new RegExp(field), `dashboard must use ${field}`);
}

assert.match(migration, /unhandled.*in_progress.*completed/s, 'migration must constrain supported response states');
assert.match(inquiriesPage, /対応状況を保存/, 'detail panel must expose response management save');
assert.match(inquiriesPage, /onInput=.*setEditingNextActionAt/, 'datetime input must update reliably across browsers');
assert.match(inquiriesPage, /\.eq\('updated_at'/, 'response updates must retain optimistic conflict protection');
assert.match(dashboardPage, /openInquiryPreview/, 'dashboard must show unresolved inquiry rows');
assert.match(sidebar, /response_status !== 'completed'/, 'sidebar count must be based on unfinished responses');
assert.match(inquiryApi, /markLLinkConnected/, 'successful L-LINK sync must mark the store as connected');

console.log('問い合わせ対応管理の静的チェックに合格しました。');
