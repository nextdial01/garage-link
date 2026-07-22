import Link from 'next/link';
import AppShell from '@/components/AppShell';
import RoleAccessGate from '@/components/RoleAccessGate';

export default function SecuritySettingsPage() {
  return (
    <AppShell
      activeLabel="車両管理設定"
      title="セキュリティ設定"
      description="ログイン、権限、監査ログなどを確認します"
      actionButton={
        <Link href="/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
          設定へ戻る
        </Link>
      }
    >
      <RoleAccessGate allowedRoles={['owner', 'admin']} backHref="/settings">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">セキュリティ設定</h3>
        <p className="mt-2 text-sm text-slate-500">この機能は今後実装します。</p>
      </section>
      </RoleAccessGate>
    </AppShell>
  );
}
