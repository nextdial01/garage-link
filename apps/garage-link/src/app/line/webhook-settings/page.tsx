import Link from 'next/link';
import { LineModuleShell } from '../_components/LineModule';
import RoleAccessGate from '@/components/RoleAccessGate';

export default function LineWebhookSettingsPage() {
  return (
    <LineModuleShell
      title="Webhook設定"
      description="LINE Webhook URL、署名検証、受信テストを管理します"
      actionButton={
        <Link href="/line/settings" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50">
          LINE設定へ戻る
        </Link>
      }
    >
      <RoleAccessGate allowedRoles={['owner', 'admin', 'implementer']}>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">Webhook設定</h3>
        <p className="mt-2 text-sm text-slate-500">この機能は今後実装します。</p>
      </section>
      </RoleAccessGate>
    </LineModuleShell>
  );
}
