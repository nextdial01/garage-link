'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import BrandLogo from '@/components/BrandLogo';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';
import {
  canImportExportSettings,
  canManageMembers,
  canManageSettings,
  getRoleLabel,
} from '@/lib/auth/permissions';

type StoreMemberRow = {
  role: string | null;
};

const settingCards = [
  {
    title: '会社情報・帳票設定',
    href: '/settings/company',
    description: '見積書・請求書に表示する会社情報、ロゴ、角印、振込先を設定します。',
  },
  {
    title: '店舗設定',
    href: '/settings/store',
    description: '店舗名、住所、営業時間、通知先などを設定します。',
  },
  {
    title: 'メンバー・権限設定',
    href: '/settings/members',
    description: 'スタッフ、権限、担当者を管理します。',
  },
  {
    title: '帳票設定',
    href: '/settings/documents',
    description: '見積書・請求書の番号ルール、備考、表示項目を設定します。',
  },
  {
    title: '設定エクスポート / インポート',
    href: '/settings/import-export',
    description: '店舗設定や業務設定を別環境へ移行します。L-Link本体設定はL-Link側で管理します。',
  },
  {
    title: 'セキュリティ設定',
    href: '/settings/security',
    description: 'ログイン、権限、監査ログなどを確認します。',
  },
  {
    title: 'プラン・契約',
    href: '/settings/billing',
    description: '現在の契約プラン、追加オプション、プラン変更申込を管理します。',
  },
  {
    title: 'L-Link連携',
    href: '/settings/l-link',
    description: 'GARAGE LINKプランごとのL-Link連携可否と、L-Linkアプリへの導線を確認します。',
  },
  {
    title: '監査ログ',
    href: '/settings/audit-logs',
    description: '作成・更新・削除・発行・送信・設定変更の履歴を確認します。',
  },
  {
    title: 'ゴミ箱 / アーカイブ',
    href: '/settings/trash',
    description: '削除済みデータを確認し、必要に応じて復元します。',
  },
  {
    title: 'セキュリティチェック',
    href: '/settings/security-check',
    description: '本番運用前に必要なセキュリティ設定を確認します。',
  },
  {
    title: '環境変数チェック',
    href: '/settings/env-check',
    description: 'Supabase、LINE、Vercel、本番URLに必要な環境変数の設定状態を確認します。',
  },
  {
    title: '本番前チェックリスト',
    href: '/settings/launch-checklist',
    description: '本番公開・顧客導入前に必要な確認項目を一覧で確認します。',
  },
];

export default function SettingsPage() {
  const [role, setRole] = useState('');
  const [isLoadingRole, setIsLoadingRole] = useState(true);

  useEffect(() => {
    async function loadRole() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user?.id) {
        setRole('');
        return;
      }

        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('role')
          .eq('user_id', userData.user.id)
          .single();

        setRole(member?.role ?? '');
      } catch {
        setRole('');
      } finally {
        setIsLoadingRole(false);
      }
    }

    void loadRole();
  }, []);

  const visibleSettingCards = settingCards.filter((card) => {
    if (card.href === '/settings/members') return canManageMembers(role);
    if (card.href === '/settings/import-export') return canImportExportSettings(role);
    if (card.href === '/settings/company' || card.href === '/settings/documents') return canManageSettings(role);
    if (card.href === '/settings/store' || card.href === '/settings/security' || card.href === '/settings/billing' || card.href === '/settings/l-link') return role === 'owner' || role === 'admin';
    if (
      card.href === '/settings/audit-logs' ||
      card.href === '/settings/trash' ||
      card.href === '/settings/security-check' ||
      card.href === '/settings/env-check' ||
      card.href === '/settings/launch-checklist'
    ) {
      return role === 'owner' || role === 'admin';
    }
    return canManageSettings(role);
  });

  return (
    <AppShell
      activeLabel="車両管理設定"
      title="車両管理設定"
      description="車両販売業務に関する設定を管理します"
    >
      {isLoadingRole ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
          権限を確認しています...
        </section>
      ) : !canManageSettings(role) ? (
        <PermissionDeniedCard />
      ) : (
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
            現在の権限: {getRoleLabel(role)}
          </div>
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <BrandLogo className="h-11 w-52 max-w-full" />
          </div>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h3 className="text-lg font-bold text-slate-950">設定メニュー</h3>
            <p className="mt-1 text-sm text-slate-500">
              LINE配信・シナリオ・リッチメニューなどの本体機能は、別SaaSのL-Link側で管理します。
            </p>
          </div>

          <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
            {visibleSettingCards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group flex min-h-40 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md"
              >
                <div className="flex w-full items-start justify-between gap-4">
                  <div>
                    <h4 className="text-base font-bold text-slate-950">{card.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
                  </div>
                  <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500 transition group-hover:bg-blue-600 group-hover:text-white">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
      )}
    </AppShell>
  );
}
