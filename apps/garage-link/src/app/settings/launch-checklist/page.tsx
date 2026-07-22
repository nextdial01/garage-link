'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';
import { getRoleLabel } from '@/lib/auth/permissions';

type CheckStatus = 'OK' | '要確認' | '未設定' | '未確認';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type OwnerRow = {
  id: string;
};

type StoreRow = {
  id: string;
  name: string | null;
  company_name: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  bank_branch_name: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  quote_note: string | null;
  invoice_note: string | null;
  logo_image_path: string | null;
  seal_image_path: string | null;
};

type LineSettingsRow = {
  id: string;
  webhook_url: string | null;
  connection_status: string | null;
};

type IdRow = {
  id: string;
};

type EnvCheckItem = {
  name: string;
  configured: boolean;
  category: string;
  public: boolean;
};

type EnvCheckResponse = {
  ok: boolean;
  error?: string;
  items?: EnvCheckItem[];
};

type SecurityCheckResponse = {
  ok: boolean;
  error?: string;
  currentRole?: string;
  permissions?: {
    ownerCount: number;
    staffViewerExportBlocked: boolean;
  };
  dataProtection?: {
    softDeleteProbe: {
      total: number;
      okCount: number;
      failedTables: string[];
    };
    auditLogsTableAvailable: boolean;
    exportSecretsExcluded: boolean;
  };
  rls?: {
    readableTables: number;
    totalTables: number;
  };
};

type ChecklistItem = {
  label: string;
  status: CheckStatus;
  detail: string;
  manual?: boolean;
};

type ChecklistSection = {
  key: string;
  title: string;
  items: ChecklistItem[];
};

type LaunchData = {
  role: string;
  store: StoreRow | null;
  ownerCount: number;
  envItems: EnvCheckItem[];
  security: SecurityCheckResponse | null;
  lineSettings: LineSettingsRow | null;
  counts: Record<string, number>;
};

const ownerAdminRoles = ['owner', 'admin'];

const countTargets = [
  'vehicles',
  'customers',
  'deals',
  'maintenance_jobs',
  'inventory_counts',
  'line_tags',
  'line_templates',
  'line_message_drafts',
];

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim() !== '');
}

function envStatus(items: EnvCheckItem[], name: string): CheckStatus {
  const item = items.find((envItem) => envItem.name === name);
  if (!item) return '未確認';
  return item.configured ? 'OK' : '未設定';
}

function statusClass(status: CheckStatus) {
  switch (status) {
    case 'OK':
      return 'bg-green-50 text-green-700 ring-green-200';
    case '要確認':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case '未設定':
      return 'bg-red-50 text-red-700 ring-red-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusClass(status)}`}>
      {status}
    </span>
  );
}

function CheckRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[auto_1fr_auto] md:items-start">
      <div className="pt-0.5">
        {item.manual ? (
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label={item.label} />
        ) : (
          <span className="inline-flex h-4 w-4 rounded-full bg-slate-200" />
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">{item.label}</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

function CheckSection({ section }: { section: ChecklistSection }) {
  const okCount = section.items.filter((item) => item.status === 'OK').length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-950">{section.title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            OK {okCount} / {section.items.length}
          </p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {section.items.map((item) => (
          <CheckRow key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  const payload = (await response.json()) as T;

  if (!response.ok) {
    return payload;
  }

  return payload;
}

async function loadTableCount(tableName: string, storeId: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from<IdRow>(tableName)
      .select('id')
      .eq('store_id', storeId);

    if (error) return 0;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

function buildSections(data: LaunchData): ChecklistSection[] {
  const store = data.store;
  const bankConfigured =
    hasText(store?.bank_name) &&
    hasText(store?.bank_branch_name) &&
    hasText(store?.bank_account_type) &&
    hasText(store?.bank_account_number) &&
    hasText(store?.bank_account_holder);
  const softDelete = data.security?.dataProtection?.softDeleteProbe;
  const softDeleteOk = softDelete ? softDelete.okCount === softDelete.total : false;
  const rlsOk = data.security?.rls
    ? data.security.rls.readableTables === data.security.rls.totalTables
    : false;

  return [
    {
      key: 'basic',
      title: 'A. 基本設定',
      items: [
        {
          label: '会社情報が設定済み',
          status: hasText(store?.company_name) && hasText(store?.address) && hasText(store?.phone) ? 'OK' : '未設定',
          detail: '会社名、住所、電話番号の登録状態を確認します。',
        },
        {
          label: '店舗情報が設定済み',
          status: hasText(store?.name) && hasText(store?.postal_code) && hasText(store?.email) ? 'OK' : '要確認',
          detail: '店舗名、郵便番号、メールアドレスの登録状態を確認します。',
        },
        { label: 'ロゴ画像が設定済み', status: hasText(store?.logo_image_path) ? 'OK' : '未設定', detail: '帳票と管理画面に使うロゴ画像パスの有無を確認します。' },
        { label: '角印画像が設定済み', status: hasText(store?.seal_image_path) ? 'OK' : '未設定', detail: '見積書・請求書に使う角印画像パスの有無を確認します。' },
        { label: '帳票備考が設定済み', status: hasText(store?.quote_note) && hasText(store?.invoice_note) ? 'OK' : '要確認', detail: '見積書備考と請求書備考を確認します。' },
        { label: '銀行口座が設定済み', status: bankConfigured ? 'OK' : '未設定', detail: '請求書に表示する振込先情報を確認します。' },
      ],
    },
    {
      key: 'env',
      title: 'B. 環境変数',
      items: [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'NEXT_PUBLIC_APP_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'LINE_CHANNEL_SECRET',
        'LINE_CHANNEL_ACCESS_TOKEN',
      ].map((name) => ({
        label: name,
        status: envStatus(data.envItems, name),
        detail: '値そのものは表示せず、設定済みかどうかだけを確認します。',
      })),
    },
    {
      key: 'supabase',
      title: 'C. Supabase',
      items: [
        { label: 'stores テーブル確認', status: store ? 'OK' : '未確認', detail: '所属店舗のstoresレコードを取得できるか確認します。' },
        { label: 'store_members テーブル確認', status: data.role ? 'OK' : '未確認', detail: 'ログインユーザーの所属店舗とroleを取得できるか確認します。' },
        { label: 'current_user_store_ids() 関数確認', status: rlsOk ? 'OK' : '要確認', detail: 'RLS経由で所属店舗データが取得できる状態か確認します。' },
        { label: 'RLS有効化確認', status: rlsOk ? 'OK' : '要確認', detail: 'Supabase管理画面でのRLS有効化も最終確認してください。' },
        {
          label: '主要テーブルの deleted_at / is_archived 確認',
          status: softDeleteOk ? 'OK' : '要確認',
          detail: softDelete ? `${softDelete.okCount}/${softDelete.total} テーブルで確認しました。` : 'セキュリティチェックで確認してください。',
        },
        {
          label: 'audit_logs テーブル確認',
          status: data.security?.dataProtection?.auditLogsTableAvailable ? 'OK' : '要確認',
          detail: '監査ログテーブルの参照可否を確認します。',
        },
      ],
    },
    {
      key: 'permissions',
      title: 'D. 権限',
      items: [
        { label: 'owner が最低1人存在する', status: data.ownerCount > 0 ? 'OK' : '要確認', detail: `${data.ownerCount}人のownerが登録されています。` },
        { label: '現在のユーザーrole', status: ownerAdminRoles.includes(data.role) ? 'OK' : '要確認', detail: `現在の権限: ${getRoleLabel(data.role)}` },
        { label: 'staff / viewer が設定系に入れない', status: '未確認', detail: 'staff/viewerアカウントで手動確認してください。', manual: true },
        { label: 'import/export が owner/admin/implementer のみ', status: data.security?.permissions?.staffViewerExportBlocked ? 'OK' : '要確認', detail: '設定移行機能の権限制御を確認します。' },
        { label: '監査ログが owner/admin のみ', status: '未確認', detail: 'staff/viewerで監査ログへ入れないことを手動確認してください。', manual: true },
      ],
    },
    {
      key: 'vehicle',
      title: 'E. 車両管理',
      items: [
        { label: '車両登録できる', status: data.counts.vehicles > 0 ? 'OK' : '未確認', detail: `${data.counts.vehicles}件の車両データがあります。`, manual: true },
        { label: '車両一覧に表示される', status: data.counts.vehicles > 0 ? 'OK' : '未確認', detail: '一覧で登録データが表示されるか確認します。', manual: true },
        { label: '車両詳細を編集できる', status: '未確認', detail: '詳細画面で保存できるか手動確認してください。', manual: true },
        { label: '顧客登録できる', status: data.counts.customers > 0 ? 'OK' : '未確認', detail: `${data.counts.customers}件の顧客データがあります。`, manual: true },
        { label: '顧客詳細を編集できる', status: '未確認', detail: '詳細画面で保存できるか手動確認してください。', manual: true },
        { label: '商談登録できる', status: data.counts.deals > 0 ? 'OK' : '未確認', detail: `${data.counts.deals}件の商談データがあります。`, manual: true },
        { label: '商談詳細を編集できる', status: '未確認', detail: '商談詳細で保存できるか手動確認してください。', manual: true },
        { label: '車両差し替えができる', status: '未確認', detail: '商談詳細で車両検索・差し替えを確認してください。', manual: true },
        { label: '整備・車検登録できる', status: data.counts.maintenance_jobs > 0 ? 'OK' : '未確認', detail: `${data.counts.maintenance_jobs}件の整備・車検データがあります。`, manual: true },
        { label: '棚卸し登録できる', status: data.counts.inventory_counts > 0 ? 'OK' : '未確認', detail: `${data.counts.inventory_counts}件の棚卸しデータがあります。`, manual: true },
      ],
    },
    {
      key: 'documents',
      title: 'F. 帳票',
      items: [
        { label: '見積書を作成できる', status: '未確認', detail: '商談詳細から見積書を作成してください。', manual: true },
        { label: '見積書プレビューが表示される', status: '未確認', detail: 'プレビュー画面でA4帳票が表示されるか確認します。', manual: true },
        { label: '見積書PDFが印刷できる', status: '未確認', detail: 'ブラウザ印刷でPDF保存できるか確認します。', manual: true },
        { label: '請求書を作成できる', status: '未確認', detail: '商談詳細から請求書を作成してください。', manual: true },
        { label: '請求書プレビューが表示される', status: '未確認', detail: 'プレビュー画面でA4帳票が表示されるか確認します。', manual: true },
        { label: '請求書PDFが印刷できる', status: '未確認', detail: 'ブラウザ印刷でPDF保存できるか確認します。', manual: true },
        { label: 'ロゴ・会社情報・角印が反映される', status: hasText(store?.logo_image_path) && hasText(store?.seal_image_path) ? 'OK' : '要確認', detail: '帳票プレビューで反映状態を確認してください。', manual: true },
        { label: '複数支払方法が表示される', status: '未確認', detail: '該当する見積・請求データで手動確認してください。', manual: true },
        { label: '下取り車両が表示される', status: '未確認', detail: '下取りありの帳票で手動確認してください。', manual: true },
      ],
    },
    {
      key: 'line',
      title: 'G. LINE管理',
      items: [
        { label: 'LINE管理トップが開く', status: data.lineSettings ? 'OK' : '要確認', detail: 'LINE設定の登録状態も確認します。', manual: true },
        { label: '友だち管理が開く', status: '未確認', detail: '/line/friends を確認してください。', manual: true },
        { label: 'タグ管理が開く', status: data.counts.line_tags > 0 ? 'OK' : '未確認', detail: `${data.counts.line_tags}件のタグデータがあります。`, manual: true },
        { label: 'テンプレート管理が開く', status: data.counts.line_templates > 0 ? 'OK' : '未確認', detail: `${data.counts.line_templates}件のテンプレートがあります。`, manual: true },
        { label: '一斉配信が開く', status: '未確認', detail: '/line/campaigns を確認してください。', manual: true },
        { label: 'シナリオ配信が開く', status: '未確認', detail: '/line/steps を確認してください。', manual: true },
        { label: '回答フォームが開く', status: '未確認', detail: '/line/forms を確認してください。', manual: true },
        { label: 'リッチメニューが開く', status: '未確認', detail: '/line/rich-menus を確認してください。', manual: true },
        { label: '自動応答が開く', status: '未確認', detail: '/line/auto-replies を確認してください。', manual: true },
        { label: '流入経路が開く', status: '未確認', detail: '/line/routes を確認してください。', manual: true },
        { label: 'LINE設定が開く', status: data.lineSettings ? 'OK' : '未確認', detail: 'LINE設定画面と保存状態を確認してください。', manual: true },
        { label: 'Webhook設定が開く', status: hasText(data.lineSettings?.webhook_url) ? 'OK' : '要確認', detail: 'Webhook URLの設定状態を確認します。', manual: true },
        { label: 'LINE案内下書きを作成できる', status: data.counts.line_message_drafts > 0 ? 'OK' : '未確認', detail: `${data.counts.line_message_drafts}件の下書きがあります。`, manual: true },
        { label: '下書き一覧に表示される', status: data.counts.line_message_drafts > 0 ? 'OK' : '未確認', detail: '/line/drafts を確認してください。', manual: true },
      ],
    },
    {
      key: 'protection',
      title: 'H. データ保護',
      items: [
        { label: '削除は論理削除になっている', status: softDeleteOk ? 'OK' : '要確認', detail: 'deleted_at / is_archived の確認結果を参照します。' },
        { label: 'ゴミ箱に削除済みが表示される', status: '未確認', detail: '/settings/trash で手動確認してください。', manual: true },
        { label: '復元できる', status: '未確認', detail: '削除済みデータの復元を手動確認してください。', manual: true },
        { label: '完全削除は無効化されている', status: '未確認', detail: '完全削除ボタンが無効または非表示であることを確認してください。', manual: true },
        { label: '監査ログに操作が残る', status: data.security?.dataProtection?.auditLogsTableAvailable ? 'OK' : '要確認', detail: '/settings/audit-logs で操作履歴を確認してください。', manual: true },
      ],
    },
    {
      key: 'deploy',
      title: 'I. デプロイ',
      items: [
        { label: 'npm run lint が成功', status: '未確認', detail: 'デプロイ前にローカルまたはCIで実行してください。', manual: true },
        { label: 'npm run build が成功', status: '未確認', detail: 'Vercelデプロイ前に成功を確認してください。', manual: true },
        { label: 'Vercel環境変数設定済み', status: envStatus(data.envItems, 'NEXT_PUBLIC_APP_URL') === 'OK' ? '要確認' : '未設定', detail: 'Vercel側のEnvironment Variablesを手動確認してください。', manual: true },
        { label: 'Supabase Auth Site URL設定済み', status: '未確認', detail: 'Supabase AuthenticationのSite URLを確認してください。', manual: true },
        { label: 'Supabase Redirect URLs設定済み', status: '未確認', detail: '本番URLとローカルURLのRedirect URLsを確認してください。', manual: true },
        { label: 'LINE Webhook URL設定済み', status: hasText(data.lineSettings?.webhook_url) ? 'OK' : '未設定', detail: 'LINE Developers側のWebhook URLも確認してください。', manual: true },
        { label: '本番URLでログインできる', status: '未確認', detail: 'Vercel本番URLでログインからダッシュボード表示まで確認してください。', manual: true },
      ],
    },
  ];
}

export default function LaunchChecklistPage() {
  const [data, setData] = useState<LaunchData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isDenied = errorMessage === '権限がありません';

  useEffect(() => {
    async function loadChecklist() {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user?.id) {
          throw new Error('ログイン情報を取得できませんでした。');
        }

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();

        if (memberError || !member?.store_id) {
          throw new Error('所属店舗を取得できませんでした。');
        }

        if (!ownerAdminRoles.includes(member.role ?? '')) {
          throw new Error('権限がありません');
        }

        const [envResponse, securityResponse, storeResult, ownersResult, lineSettingsResult] = await Promise.all([
          fetchJson<EnvCheckResponse>('/api/settings/env-check'),
          fetchJson<SecurityCheckResponse>('/api/security-check'),
          supabase
            .from<StoreRow>('stores')
            .select('id, name, company_name, postal_code, address, phone, email, bank_name, bank_branch_name, bank_account_type, bank_account_number, bank_account_holder, quote_note, invoice_note, logo_image_path, seal_image_path')
            .eq('id', member.store_id)
            .single(),
          supabase
            .from<OwnerRow>('store_members')
            .select('id')
            .eq('store_id', member.store_id)
            .eq('role', 'owner'),
          supabase
            .from<LineSettingsRow>('line_settings')
            .select('id, webhook_url, connection_status')
            .eq('store_id', member.store_id)
            .single(),
        ]);

        if (storeResult.error) {
          throw new Error(storeResult.error.message);
        }

        const countEntries = await Promise.all(
          countTargets.map(async (tableName) => [tableName, await loadTableCount(tableName, member.store_id)] as const)
        );

        setData({
          role: member.role ?? '',
          store: storeResult.data,
          ownerCount: ownersResult.data?.length ?? 0,
          envItems: envResponse?.ok ? envResponse.items ?? [] : [],
          security: securityResponse?.ok ? securityResponse : null,
          lineSettings: lineSettingsResult.data ?? null,
          counts: Object.fromEntries(countEntries),
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '本番前チェックリストを取得できませんでした。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadChecklist();
  }, []);

  const sections = useMemo(() => (data ? buildSections(data) : []), [data]);
  const summary = useMemo(() => {
    const items = sections.flatMap((section) => section.items);
    return {
      total: items.length,
      ok: items.filter((item) => item.status === 'OK').length,
      needsReview: items.filter((item) => item.status === '要確認').length,
      unset: items.filter((item) => item.status === '未設定').length,
      unchecked: items.filter((item) => item.status === '未確認').length,
    };
  }, [sections]);

  return (
    <AppShell
      activeLabel="本番前チェックリスト"
      title="本番前チェックリスト"
      description="GARAGE LINKを本番公開・顧客導入する前に必要な確認項目です。"
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
          読み込み中...
        </section>
      ) : isDenied ? (
        <PermissionDeniedCard backHref="/settings" />
      ) : errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">
          {errorMessage}
        </section>
      ) : data ? (
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">確認サマリー</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  自動判定できる項目は設定状態と件数だけを表示します。手動確認項目は導入前にチェックしてください。
                </p>
                <p className="mt-2 text-sm font-bold text-slate-700">
                  現在の権限: {getRoleLabel(data.role)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                {[
                  ['総項目', summary.total, 'bg-slate-100 text-slate-700'],
                  ['OK', summary.ok, 'bg-green-50 text-green-700'],
                  ['要確認', summary.needsReview, 'bg-amber-50 text-amber-700'],
                  ['未設定', summary.unset, 'bg-red-50 text-red-700'],
                  ['未確認', summary.unchecked, 'bg-slate-100 text-slate-600'],
                ].map(([label, value, className]) => (
                  <div key={label} className={`rounded-xl px-4 py-3 ${className}`}>
                    <p className="text-xs font-bold">{label}</p>
                    <p className="mt-1 text-xl font-black">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/settings/env-check" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                環境変数チェックへ
              </Link>
              <Link href="/settings/security-check" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
                セキュリティチェックへ
              </Link>
              <Link href="/settings/audit-logs" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                監査ログへ
              </Link>
              <Link href="/settings/trash" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                ゴミ箱へ
              </Link>
              <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                設定へ戻る
              </Link>
            </div>
          </section>

          <div className="grid gap-6">
            {sections.map((section) => (
              <CheckSection key={section.key} section={section} />
            ))}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
