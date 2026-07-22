'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ContextHelp from '@/components/ContextHelp';
import { createClient } from '@/lib/supabase/client';
import { filterMenuGroupsByRole } from '@/lib/store/uiPreferences';

type StoreMemberRow = {
  role: string | null;
};

const descriptions: Record<string, string> = {
  '/dashboard': '今日の対応と重要な数字を確認します。',
  '/appointments': '来店・試乗・整備予約を一覧で確認します。',
  '/deals': '商談の進捗と次回対応を追います。',
  '/customers': '顧客情報と対応予定を確認します。',
  '/maintenance': '整備案件と納車予定を管理します。',
  '/inquiries': 'L-LINK経由の問い合わせを紐付けます。',
  '/vehicles': '車両在庫、掲載状況、長期滞留を確認します。',
  '/vehicle-management': '入出庫の動きをまとめて管理します。',
  '/parts': '部品在庫と使用履歴を確認します。',
  '/quotes': '見積書の作成と発行状況を管理します。',
  '/invoices': '請求書の作成と発行状況を管理します。',
  '/inventory-counts': '棚卸し結果を確認します。',
  '/analytics': '分析画面で期間別に詳しく確認します。',
  '/settings': '設定メニューを開きます。',
  '/settings/store': '主タブや集計基準、長期在庫閾値を設定します。',
  '/settings/company': '会社情報と帳票表示を設定します。',
  '/settings/members': 'メンバーと権限を管理します。',
  '/settings/customer-follow-up/inspection-reminders': '車検案内の通知ルールを設定します。',
  '/settings/billing': 'プランと契約内容を確認します。',
};

const groupDescriptions: Record<string, string> = {
  '日常業務': '予約・商談・顧客・整備・問い合わせなど、日々の対応画面をまとめています。',
  '書類・在庫': '車両、部品、見積、請求、棚卸しなど、販売と在庫に関する画面をまとめています。',
  '設定': '分析、店舗情報、権限、通知、契約など、管理者向けの画面をまとめています。',
};

export default function MenuPage() {
  const [role, setRole] = useState('viewer');

  useEffect(() => {
    async function loadRole() {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user?.id) {
          setRole('viewer');
          return;
        }

        const { data: member } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('role')
          .eq('user_id', userData.user.id)
          .single();

        setRole(member?.role ?? 'viewer');
      } catch {
        setRole('viewer');
      }
    }

    void loadRole();
  }, []);

  const visibleMenuGroups = useMemo(() => filterMenuGroupsByRole(role), [role]);

  return (
    <AppShell
      activeLabel="メニュー"
      title="メニュー"
      description="主タブに入っていない機能を、業務ごとにまとめて開けます。"
    >
      <div className="space-y-6">
        {visibleMenuGroups.map((group) => (
          <section key={group.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <p className="text-xs font-black tracking-[0.18em] text-slate-500">{group.title}</p>
              <ContextHelp
                title={group.title}
                description={groupDescriptions[group.title] ?? group.items.map((item) => item.label).join('・')}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={descriptions[item.href]}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-black text-slate-900 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
                >
                  <span className="min-w-0">{item.label}</span>
                  <span aria-hidden="true" className="shrink-0 text-blue-600">→</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
