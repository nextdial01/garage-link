'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';

type EnvCategory = 'Supabase' | 'LINE' | 'App' | 'E2E';

type EnvCheckItem = {
  name: string;
  configured: boolean;
  category: EnvCategory;
  public: boolean;
};

type EnvCheckResponse = {
  ok: boolean;
  error?: string;
  items?: EnvCheckItem[];
};

const categoryLabels: Record<EnvCategory, string> = {
  Supabase: 'Supabase',
  LINE: 'LINE',
  App: 'App',
  E2E: 'E2E Test',
};

const categoryOrder: EnvCategory[] = ['Supabase', 'LINE', 'App', 'E2E'];

const deploymentNotes = [
  {
    title: 'NEXT_PUBLIC_APP_URL',
    body: 'ローカルでは http://localhost:3000、本番では https://本番ドメイン を設定します。Webhook URLや案内文リンクの生成に使います。',
  },
  {
    title: 'SUPABASE_SERVICE_ROLE_KEY',
    body: '未設定でも通常画面は動きますが、Webhookイベント保存など一部のサーバー管理APIが制限される可能性があります。NEXT_PUBLICにはしないでください。',
  },
  {
    title: 'LINE Channel情報',
    body: 'LINE_CHANNEL_SECRET が未設定の場合はWebhook署名検証ができません。LINE_CHANNEL_ACCESS_TOKEN が未設定の場合は実送信に進めません。',
  },
];

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${
        configured
          ? 'bg-green-50 text-green-700 ring-green-200'
          : 'bg-red-50 text-red-700 ring-red-200'
      }`}
    >
      {configured ? '設定済み' : '未設定'}
    </span>
  );
}

function VisibilityBadge({ isPublic }: { isPublic: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${
        isPublic
          ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {isPublic ? 'ブラウザ公開' : 'Server専用'}
    </span>
  );
}

export default function EnvCheckPage() {
  const [items, setItems] = useState<EnvCheckItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const isDenied = errorMessage === '権限がありません';

  useEffect(() => {
    async function loadEnvCheck() {
      try {
        setIsLoading(true);
        setErrorMessage('');
        const response = await fetch('/api/settings/env-check');
        const payload = (await response.json()) as EnvCheckResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? '環境変数の設定状態を取得できませんでした。');
        }

        setItems(payload.items ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '環境変数の設定状態を取得できませんでした。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadEnvCheck();
  }, []);

  const groupedItems = useMemo(() => {
    return categoryOrder.map((category) => ({
      category,
      items: items.filter((item) => item.category === category),
    }));
  }, [items]);

  const missingCount = items.filter((item) => !item.configured).length;

  return (
    <AppShell
      activeLabel="環境変数チェック"
      title="環境変数チェック"
      description="ローカル・本番環境で必要な環境変数が設定されているか確認します。値そのものは表示しません。"
    >
      {isLoading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
          環境変数の設定状態を確認しています...
        </section>
      ) : isDenied ? (
        <PermissionDeniedCard backHref="/settings" />
      ) : errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">
          {errorMessage}
        </section>
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">設定状態サマリー</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  secret系の値は画面にもAPIレスポンスにも含めません。Vercel本番では `.env.local` ではなく、Vercel側のEnvironment Variablesに設定してください。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  確認項目: {items.length}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${missingCount > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  未設定: {missingCount}
                </span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/settings/security-check"
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                セキュリティチェックへ
              </Link>
              <Link
                href="/settings"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                設定に戻る
              </Link>
            </div>
          </section>

          {groupedItems.map((group) => (
            <section key={group.category} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-lg font-bold text-slate-950">{categoryLabels[group.category]}</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <div key={item.name} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        {item.public ? 'NEXT_PUBLIC_ はブラウザに公開されます。' : 'secret系はServer専用として扱います。'}
                      </p>
                    </div>
                    <VisibilityBadge isPublic={item.public} />
                    <StatusBadge configured={item.configured} />
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-950">Vercel本番設定メモ</h3>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-3">
              {deploymentNotes.map((note) => (
                <div key={note.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-800">{note.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{note.body}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
