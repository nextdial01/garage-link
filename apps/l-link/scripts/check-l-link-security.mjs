import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sql = readFileSync(resolve(root, 'supabase/schema/010_l_link_core.sql'), 'utf8');
const shell = readFileSync(resolve(root, 'src/components/LLinkShell.tsx'), 'utf8');
const webhook = readFileSync(resolve(root, 'src/app/api/line/webhook/route.ts'), 'utf8');
const diagnostics = readFileSync(resolve(root, 'src/app/settings/line/diagnostics/page.tsx'), 'utf8');
const friendsPage = readFileSync(resolve(root, 'src/app/friends/page.tsx'), 'utf8');
const friendsLib = readFileSync(resolve(root, 'src/lib/line/friends.ts'), 'utf8');
const formsLib = readFileSync(resolve(root, 'src/lib/forms/lLinkForms.ts'), 'utf8');
const profileOptions = readFileSync(resolve(root, 'src/lib/friends/profileOptions.ts'), 'utf8');
const richMenusLib = readFileSync(resolve(root, 'src/lib/rich-menus/lLinkRichMenus.ts'), 'utf8');
const segmentsLib = readFileSync(resolve(root, 'src/lib/segments/lLinkSegments.ts'), 'utf8');
const broadcastsLib = readFileSync(resolve(root, 'src/lib/broadcasts/lLinkBroadcasts.ts'), 'utf8');
const lineSettings = readFileSync(resolve(root, 'src/app/settings/line/page.tsx'), 'utf8');
const lineTestSend = readFileSync(resolve(root, 'src/lib/line/sendTestMessage.ts'), 'utf8');
const lineTestSendForm = readFileSync(resolve(root, 'src/app/settings/line/LineTestSendForm.tsx'), 'utf8');
const lineMessagesPage = readFileSync(resolve(root, 'src/app/line/messages/page.tsx'), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) return walk(path);
    return path;
  });
}

const appSourceFiles = walk(resolve(root, 'src')).filter((path) => /\.(ts|tsx|js|jsx|mjs)$/.test(path));
const appSource = appSourceFiles.map((path) => readFileSync(path, 'utf8')).join('\n');

const requiredTables = [
  'll_line_accounts',
  'll_line_webhook_events',
  'll_line_friends',
  'll_friend_profiles',
  'll_friend_notes',
  'll_tags',
  'll_friend_tags',
  'll_inflow_routes',
  'll_inflow_events',
  'll_forms',
  'll_form_questions',
  'll_form_answers',
  'll_form_answer_items',
  'll_rich_menus',
  'll_rich_menu_areas',
  'll_broadcasts',
  'll_broadcast_targets',
  'll_segments',
  'll_segment_conditions',
  'll_scheduled_messages',
  'll_step_scenarios',
  'll_step_messages',
  'll_scenario_branches',
  'll_message_logs',
  'll_delivery_counts',
  'll_click_events',
  'll_staff_roles',
  'll_permissions',
];

const forbidden = ['ll_products', 'll_orders', 'll_payments', 'll_product_pages', 'll_affiliates'];
const failures = [];

for (const table of requiredTables) {
  if (!sql.includes(`create table if not exists public.${table}`)) failures.push(`${table}: create table missing`);
  if (!sql.includes(`alter table public.${table} enable row level security`)) failures.push(`${table}: RLS missing`);
}

for (const table of forbidden) {
  if (sql.includes(`create table if not exists public.${table}`)) failures.push(`${table}: forbidden product/payment table created`);
  if (shell.includes(table.replace('ll_', ''))) failures.push(`${table}: forbidden product/payment menu reference`);
}

for (const needle of [
  'add column if not exists',
  'create index if not exists',
  'drop constraint if exists ll_line_friends_company_account_user_unique',
  'drop constraint if exists ll_tags_company_name_key',
  'drop constraint if exists ll_friend_tags_company_friend_tag_key',
  'drop constraint if exists ll_delivery_counts_company_account_month_key',
  'drop constraint if exists ll_permissions_company_role_code_key',
  'drop policy if exists',
  'create policy',
  'create or replace function public.ll_current_user_company_ids',
  'create or replace function public.ll_current_user_role',
  'create or replace function public.ll_has_company_role',
  'create or replace function public.ll_set_updated_at',
  'drop trigger if exists',
]) {
  if (!sql.includes(needle)) failures.push(`SQL idempotency/RLS check missing: ${needle}`);
}

for (const needle of ['request.text()', 'verifyLineSignature', 'decryptSecret', 'raw_event_hash']) {
  if (!webhook.includes(needle)) failures.push(`Webhook safety check missing: ${needle}`);
}

for (const needle of ['hasEncryptionKey', 'encryption_key_missing', '暗号化キーが未設定です']) {
  if (!lineSettings.includes(needle)) {
    failures.push(`Line settings encryption-key UX check missing: ${needle}`);
  }
}

for (const forbiddenNeedle of [
  'channel_secret_encrypted',
  'channel_access_token_encrypted',
  'decryptSecret',
  'raw_event:',
  'raw_event_text',
  'rawEvent',
]) {
  if (diagnostics.includes(forbiddenNeedle)) {
    failures.push(`Diagnostics page must not display or decrypt secret/raw event data: ${forbiddenNeedle}`);
  }
}

if (!diagnostics.includes('process.env.NODE_ENV === "production"')) {
  failures.push('Diagnostics test event action must be disabled in production');
}

if (!diagnostics.includes('process.env.NODE_ENV !== "production"')) {
  failures.push('Diagnostics test event buttons must be hidden in production');
}

if (!diagnostics.includes('diagnosticRedirect("error"')) {
  failures.push('Diagnostics test event action must return visible error feedback');
}

if (!diagnostics.includes('diagnosticRedirect("success"')) {
  failures.push('Diagnostics test event action must return visible success feedback');
}

if (!diagnostics.includes('channelAccessToken: null')) {
  failures.push('Diagnostics test event creation must not use LINE channel access token');
}

if (!diagnostics.includes('dbFailure(')) {
  failures.push('Diagnostics test event creation must not swallow database errors');
}

if (!friendsLib.includes(".from('ll_line_friends')")) {
  failures.push('/friends must query ll_line_friends');
}

for (const grantNeedle of [
  'grant select, insert, update, delete on table public.ll_friend_notes to service_role',
  'grant select, insert, update, delete on table public.ll_friend_tags to service_role',
  'grant select, insert, update, delete on table public.ll_tags to service_role',
  'grant select, insert, update, delete on table public.ll_forms to service_role',
  'grant select, insert, update, delete on table public.ll_form_questions to service_role',
  'grant select, insert, update, delete on table public.ll_form_answers to service_role',
  'grant select, insert, update, delete on table public.ll_form_answer_items to service_role',
]) {
  if (!sql.includes(grantNeedle)) {
    failures.push(`L-Link tag grant missing: ${grantNeedle}`);
  }
}

for (const rlsNeedle of [
  "'ll_friend_tags'",
  "'ll_tags'",
  'create policy %I on public.%I for select using (company_id in (select public.ll_current_user_company_ids()))',
]) {
  if (!sql.includes(rlsNeedle)) {
    failures.push(`L-Link tag RLS check missing: ${rlsNeedle}`);
  }
}

if (!friendsLib.includes('tagWarning') || !friendsPage.includes('result.warning')) {
  failures.push('/friends must keep friend list visible when tag fetch fails');
}

const friendDetailPage = readFileSync(resolve(root, 'src/app/friends/[id]/page.tsx'), 'utf8');
for (const detailNeedle of [
  'getFriendDetail(id)',
  'll_friend_profiles',
  'll_friend_notes',
  'll_friend_tags',
  'listMessageLogs(id)',
  'friend.display_name || friend.line_user_id',
  'friend_action_message',
  'SelectField label="顧客ステータス"',
  'SelectField label="流入経路"',
  'SelectField label="希望連絡方法"',
  'SelectField label="興味カテゴリ"',
  'SelectField label="問い合わせ種別"',
  'getFriendProfileOptionLabel',
]) {
  if (!friendDetailPage.includes(detailNeedle)) {
    failures.push(`/friends/[id] detail capability missing: ${detailNeedle}`);
  }
}

for (const optionNeedle of [
  'customer_status',
  'source',
  'preferred_contact_method',
  'interest_category',
  'inquiry_type',
  'prospect',
  'store_qr',
  'purchase_consultation',
  'normalizeFriendProfileOptionValue',
]) {
  if (!profileOptions.includes(optionNeedle)) {
    failures.push(`Friend profile option definition missing: ${optionNeedle}`);
  }
}

for (const formNeedle of [
  'src/app/forms/page.tsx',
  'src/app/forms/new/page.tsx',
  'src/app/forms/[id]/page.tsx',
  'src/app/forms/[id]/edit/page.tsx',
  'src/app/forms/[id]/answers/page.tsx',
  'src/app/f/[formId]/page.tsx',
  'src/app/rich-menus/page.tsx',
  'src/app/rich-menus/new/page.tsx',
  'src/app/rich-menus/[id]/page.tsx',
  'src/app/rich-menus/[id]/edit/page.tsx',
  'src/app/segments/page.tsx',
  'src/app/segments/new/page.tsx',
  'src/app/segments/[id]/page.tsx',
  'src/app/segments/[id]/edit/page.tsx',
  'src/app/broadcasts/page.tsx',
  'src/app/broadcasts/new/page.tsx',
  'src/app/broadcasts/[id]/page.tsx',
]) {
  const relativePath = resolve(root, formNeedle);
  try {
    statSync(relativePath);
  } catch {
    failures.push(`L-Link form page missing: ${formNeedle}`);
  }
}

for (const segmentNeedle of [
  'll_segments',
  'll_segment_conditions',
  'll_line_friends',
  'll_friend_profiles',
  'll_friend_tags',
  'matchesSegmentConditions',
  'companyId',
]) {
  if (!segmentsLib.includes(segmentNeedle)) {
    failures.push(`L-Link segment processing missing: ${segmentNeedle}`);
  }
}

for (const broadcastNeedle of [
  'll_broadcasts',
  'll_broadcast_targets',
  'resolveBroadcastTargets',
  'target_count',
  'companyId',
]) {
  if (!broadcastsLib.includes(broadcastNeedle)) {
    failures.push(`L-Link broadcast draft processing missing: ${broadcastNeedle}`);
  }
}

for (const segmentBroadcastSqlNeedle of [
  'alter table public.ll_segments add column if not exists description',
  'alter table public.ll_segment_conditions add column if not exists field',
  'alter table public.ll_broadcasts add column if not exists target_type',
  'alter table public.ll_broadcast_targets add column if not exists line_friend_id',
  'alter table public.ll_message_logs add column if not exists webhook_event_id',
  'alter table public.ll_line_friends add column if not exists last_message_text',
  'grant select, insert, update, delete on table public.ll_segments to service_role',
  'grant select, insert, update, delete on table public.ll_segment_conditions to service_role',
  'grant select, insert, update, delete on table public.ll_broadcasts to service_role',
  'grant select, insert, update, delete on table public.ll_broadcast_targets to service_role',
]) {
  if (!sql.includes(segmentBroadcastSqlNeedle)) {
    failures.push(`L-Link segment/broadcast SQL/grant missing: ${segmentBroadcastSqlNeedle}`);
  }
}

for (const forbiddenLineSendApi of [
  'api.line.me/v2/bot/message/multicast',
  'api.line.me/v2/bot/message/broadcast',
  'client.multicast',
  'client.broadcast',
]) {
  if (appSource.includes(forbiddenLineSendApi)) {
    failures.push(`LINE send API must not be implemented yet: ${forbiddenLineSendApi}`);
  }
}

for (const testSendNeedle of [
  'api.line.me/v2/bot/message/push',
  'L_LINK_LINE_TEST_USER_ID',
  'lineFriendId',
  'targetFriend.line_user_id !== envTestUserId',
  'direction: "outbound_test"',
  'window.confirm',
]) {
  const source = testSendNeedle === 'window.confirm' ? lineTestSendForm : lineTestSend;
  if (!source.includes(testSendNeedle)) {
    failures.push(`Single-user LINE test send safety check missing: ${testSendNeedle}`);
  }
}

for (const settingsNeedle of [
  'latestWebhookReceivedAt',
  'latestWebhookEventType',
  'L_LINK_WEBHOOK_BASE_URL',
  'LineTestSendForm',
  'broadcast / multicast 未実装',
]) {
  if (!lineSettings.includes(settingsNeedle)) {
    failures.push(`Line settings test connection UI missing: ${settingsNeedle}`);
  }
}

for (const messageLogNeedle of [
  "from(\"ll_message_logs\")",
  'webhook_event_id',
  'll_line_friends',
  '本番一斉配信なし',
]) {
  if (!lineMessagesPage.includes(messageLogNeedle)) {
    failures.push(`Line message log page missing: ${messageLogNeedle}`);
  }
}

for (const richMenuNeedle of [
  "from(\"ll_rich_menus\")",
  "from(\"ll_rich_menu_areas\")",
  "from(\"ll_forms\")",
  'companyId',
  'publicFormUrl',
]) {
  if (!richMenusLib.includes(richMenuNeedle)) {
    failures.push(`L-Link rich menu processing missing: ${richMenuNeedle}`);
  }
}

for (const richMenuSqlNeedle of [
  'alter table public.ll_rich_menus add column if not exists image_url',
  'alter table public.ll_rich_menus add column if not exists size_type',
  'alter table public.ll_rich_menu_areas add column if not exists x',
  'grant select, insert, update, delete on table public.ll_rich_menus to service_role',
  'grant select, insert, update, delete on table public.ll_rich_menu_areas to service_role',
  'll_rich_menus_company_status_idx',
  'll_rich_menu_areas_company_menu_idx',
]) {
  if (!sql.includes(richMenuSqlNeedle)) {
    failures.push(`L-Link rich menu SQL/grant missing: ${richMenuSqlNeedle}`);
  }
}

for (const forbiddenRichMenuApi of [
  'api.line.me/v2/bot/richmenu',
  'client.createRichMenu',
  'setDefaultRichMenu',
  'uploadRichMenuImage',
]) {
  if (richMenusLib.includes(forbiddenRichMenuApi) || appSource.includes(forbiddenRichMenuApi)) {
    failures.push(`LINE rich menu production API reflection must not be implemented yet: ${forbiddenRichMenuApi}`);
  }
}

for (const formNeedle of [
  "from('ll_form_answers')",
  "from('ll_form_answer_items')",
  "from('ll_friend_profiles').upsert",
  "from('ll_friend_tags').upsert",
  'profile_mapping',
  'auto_tag_ids',
  'normalizeFriendProfileOptionValue',
]) {
  if (!formsLib.includes(formNeedle)) {
    failures.push(`L-Link form processing missing: ${formNeedle}`);
  }
}

if (!friendsPage.includes('friend.display_name || friend.line_user_id')) {
  failures.push('/friends must show line_user_id when display_name is null');
}

for (const statusValue of ['value="all"', 'value="active"', 'value="unfollowed"']) {
  if (!friendsPage.includes(statusValue)) {
    failures.push(`/friends friend_status filter missing: ${statusValue}`);
  }
}

for (const forbiddenReference of [
  "from('line_templates')",
  'from("line_templates")',
  'public.line_templates',
  "from('line_friends')",
  'from("line_friends")',
  'public.line_friends',
  "from('line_webhook_events')",
  'from("line_webhook_events")',
  'public.line_webhook_events',
]) {
  if (appSource.includes(forbiddenReference)) {
    failures.push(`Old GARAGE LINK LINE table reference found in apps/l-link: ${forbiddenReference}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('L-Link security static checks passed.');
