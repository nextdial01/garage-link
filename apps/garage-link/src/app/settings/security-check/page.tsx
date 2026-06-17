'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { getRoleLabel } from '@/lib/auth/permissions';

type CheckStatus = 'OK' | '注意' | '未設定';

type SecurityCheckResponse = {
  ok: boolean;
  error?: string;
  currentRole?: string;
  supabase?: {
    urlConfigured: boolean;
    anonKeyConfigured: boolean;
    serviceRoleServerConfigured: boolean;
    serviceRoleExposedToBrowser: boolean;
  };
  line?: {
    channelSecretConfigured: boolean;
    channelAccessTokenConfigured: boolean;
    encryptedChannelSecretExists: boolean;
    envSecretFallbackConfigured: boolean;
    envSecretFallbackDisabled: boolean;
    storedChannelAccessTokenExists: boolean;
    webhookUrlConfigured: boolean;
  };
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
    note: string;
    readableTables: number;
    totalTables: number;
  };
};

type CheckItem = {
  label: string;
  status: CheckStatus;
  detail: string;
};

function statusClass(status: CheckStatus) {
  if (status === 'OK') {
    return 'bg-green-50 text-green-700 ring-green-200';
  }
  if (status === '注意') {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  return 'bg-red-50 text-red-700 ring-red-200';
}

function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusClass(status)}`}>
      {status}
    </span>
  );
}

function CheckSection({ title, items }: { title: string; items: CheckItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.label} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-bold text-slate-800">{item.label}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
            </div>
            <StatusBadge status={item.status} />
          </div>
        ))}
      </div>
    </section>
  );
}

function toConfiguredStatus(value: boolean): CheckStatus {
  return value ? 'OK' : '未設定';
}

export default function SecurityCheckPage() {
  const [result, setResult] = useState<SecurityCheckResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isDenied = errorMessage === '権限がありません';

  useEffect(() => {
    async function loadSecurityCheck() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const response = await fetch('/api/security-check');
        const payload = (await response.json()) as SecurityCheckResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? 'セキュリティチェックを取得できませんでした。');
        }

        setResult(payload);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'セキュリティチェックを取得できませんでした。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadSecurityCheck();
  }, []);

  const sections = useMemo<{ title: string; items: CheckItem[] }[]>(() => {
    if (!result) {
      return [];
    }

    const softDelete = result.dataProtection?.softDeleteProbe;
    const softDeleteOk = softDelete ? softDelete.okCount === softDelete.total : false;

    return [
      {
        title: 'Supabase',
        items: [
          {
            label: 'NEXT_PUBLIC_SUPABASE_URL が設定済み',
            status: toConfiguredStatus(Boolean(result.supabase?.urlConfigured)),
            detail: '値そのものは表示せず、環境変数が存在するかだけを確認します。',
          },
          {
            label: 'NEXT_PUBLIC_SUPABASE_ANON_KEY が設定済み',
            status: toConfiguredStatus(Boolean(result.supabase?.anonKeyConfigured)),
            detail: '公開anon keyの有無だけを確認します。',
          },
          {
            label: 'SUPABASE_SERVICE_ROLE_KEY はブラウザに露出していない',
            status: result.supabase?.serviceRoleExposedToBrowser ? '注意' : 'OK',
            detail: result.supabase?.serviceRoleServerConfigured
              ? 'service_role keyはサーバー側でのみ存在を確認しています。'
              : 'service_role keyは未設定です。必要なサーバー処理がある場合のみ設定してください。',
          },
          {
            label: 'RLS有効化対象テーブルの確認',
            status: result.rls && result.rls.readableTables === result.rls.totalTables ? 'OK' : '注意',
            detail: result.rls ? `${result.rls.readableTables}/${result.rls.totalTables} テーブルを所属店舗データとして確認しました。${result.rls.note}` : '確認できませんでした。',
          },
        ],
      },
      {
        title: 'LINE',
        items: [
          {
            label: 'LINE_CHANNEL_SECRET が設定済み',
            status: toConfiguredStatus(Boolean(result.line?.channelSecretConfigured)),
            detail: 'サーバー側環境変数の有無だけを確認します。',
          },
          {
            label: 'Webhook署名検証が暗号化済みChannel Secretを優先している',
            status: result.line?.encryptedChannelSecretExists ? 'OK' : '注意',
            detail: result.line?.encryptedChannelSecretExists
              ? 'DBの暗号化済みChannel Secretを優先できます。'
              : '暗号化済みChannel Secretが未設定です。環境変数fallbackは暫定互換のため、本番マルチテナント前に無効化してください。',
          },
          {
            label: 'LINE_CHANNEL_SECRET fallbackは暫定互換',
            status: result.line?.envSecretFallbackConfigured && !result.line?.envSecretFallbackDisabled ? '注意' : 'OK',
            detail: result.line?.envSecretFallbackConfigured && !result.line?.envSecretFallbackDisabled
              ? '環境変数fallbackが設定されています。単一tenant互換用であり、マルチテナント本番では無効化してください。'
              : result.line?.envSecretFallbackDisabled
                ? '環境変数fallbackは無効化されています。'
                : '環境変数fallbackは未設定です。',
          },
          {
            label: 'LINE_CHANNEL_ACCESS_TOKEN が設定済み',
            status: toConfiguredStatus(Boolean(result.line?.channelAccessTokenConfigured)),
            detail: 'サーバー側環境変数の有無だけを確認します。',
          },
          {
            label: 'line_settings のChannel Access Tokenはマスク表示',
            status: result.line?.storedChannelAccessTokenExists ? '注意' : 'OK',
            detail: result.line?.storedChannelAccessTokenExists
              ? 'DBに保存済みです。設定画面とAPIレスポンスでは平文を返さず、マスク表示のみ行います。'
              : 'DB上のLINEアクセストークンは未保存です。',
          },
          {
            label: 'Webhook URLが設定済み',
            status: toConfiguredStatus(Boolean(result.line?.webhookUrlConfigured)),
            detail: 'LINE設定にWebhook URLが登録されているかだけを確認します。',
          },
        ],
      },
      {
        title: '権限',
        items: [
          {
            label: '現在のユーザーrole',
            status: result.currentRole === 'owner' || result.currentRole === 'admin' ? 'OK' : '注意',
            detail: `現在の権限: ${getRoleLabel(result.currentRole)}`,
          },
          {
            label: 'ownerユーザーが最低1人存在する',
            status: result.permissions && result.permissions.ownerCount > 0 ? 'OK' : '注意',
            detail: `${result.permissions?.ownerCount ?? 0}人のオーナーが登録されています。`,
          },
          {
            label: 'viewer/staffに設定エクスポート権限がない',
            status: result.permissions?.staffViewerExportBlocked ? 'OK' : '注意',
            detail: '画面/APIの権限制御でowner/admin/implementerのみ許可しています。',
          },
        ],
      },
      {
        title: 'データ保護',
        items: [
          {
            label: '論理削除カラムが主要テーブルに存在する',
            status: softDeleteOk ? 'OK' : '注意',
            detail: softDelete
              ? `${softDelete.okCount}/${softDelete.total} テーブルで確認しました。未確認: ${softDelete.failedTables.length > 0 ? softDelete.failedTables.join(', ') : '-'}`
              : '確認できませんでした。',
          },
          {
            label: '監査ログテーブルが存在する',
            status: result.dataProtection?.auditLogsTableAvailable ? 'OK' : '注意',
            detail: 'audit_logsへの参照可否を確認しています。',
          },
          {
            label: '設定エクスポートでAPIキーを除外している',
            status: result.dataProtection?.exportSecretsExcluded ? 'OK' : '注意',
            detail: 'APIキー、顧客情報、銀行口座、画像パスなどを除外する方針です。',
          },
        ],
      },
    ];
  }, [result]);

  return (
    <AppShell
      activeLabel="セキュリティチェック"
      title="セキュリティチェック"
      description="本番運用前に必要な設定状態を確認します"
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
          セキュリティ項目を確認しています...
        </section>
      ) : isDenied ? (
        <PermissionDeniedCard />
      ) : errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">
          {errorMessage}
        </section>
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-slate-500">
              秘密情報の値は表示しません。設定済みかどうか、権限・論理削除・監査ログの準備状態だけを確認します。
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/settings/env-check"
                className="inline-flex justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                環境変数チェックへ
              </Link>
              <Link
                href="/settings"
                className="inline-flex justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                設定に戻る
              </Link>
            </div>
          </div>

          {sections.map((section) => (
            <CheckSection key={section.title} title={section.title} items={section.items} />
          ))}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Vercel本番設定の注意</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-800">NEXT_PUBLIC_APP_URL</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">ローカルは localhost、本番は公開ドメインを設定します。</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-800">Service Role Key</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">未設定の場合、一部のサーバー管理APIが制限される可能性があります。</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-800">LINE Channel情報</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">未設定の場合、Webhook署名検証や実送信は利用できません。</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
