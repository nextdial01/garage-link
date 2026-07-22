import Link from 'next/link';
import AppShell from '@/components/AppShell';
import BrandLogo from '@/components/BrandLogo';
import RoleAccessGate from '@/components/RoleAccessGate';

export default function DocumentSettingsPage() {
  return (
    <AppShell
      activeLabel="帳票設定"
      title="帳票設定"
      description="見積書・請求書の番号ルール、備考、表示項目を設定します"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      <RoleAccessGate allowedRoles={['owner', 'admin', 'implementer']} backHref="/settings">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-950">帳票設定</h3>
            <p className="mt-2 text-sm text-slate-500">この機能は今後実装します。</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <BrandLogo className="h-12 w-56 max-w-full" />
          </div>
        </div>
      </section>
      </RoleAccessGate>
    </AppShell>
  );
}
