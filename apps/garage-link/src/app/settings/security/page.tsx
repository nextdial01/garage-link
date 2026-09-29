import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { redirect } from 'next/navigation';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { getRoleLabel } from '@/lib/auth/permissions';
import { getAccountSecurityOverview } from '@/lib/security/accountSecurityOverview';

export default async function SecuritySettingsPage() {
  const overview = await getAccountSecurityOverview();
  if (overview.kind === 'unauthenticated') redirect('/login');
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
      {overview.kind === 'forbidden' ? <PermissionDeniedCard backHref="/settings" /> : overview.kind !== 'ready' ? (
        <section role="alert" className="rounded-2xl border border-amber-300 bg-white p-6 text-slate-700">
          現在のセキュリティ状態を確認できませんでした。時間をおいて、この画面を開き直してください。
        </section>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">現在のアカウント</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-sm text-slate-500">メールアドレス</dt><dd className="break-all font-semibold">{overview.email || '未設定'}</dd></div>
              <div><dt className="text-sm text-slate-500">現在の店舗での権限</dt><dd className="font-semibold">{getRoleLabel(overview.role)}</dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">ログインの保護</h2>
            <dl className="mt-4 space-y-5">
              <div><dt className="font-bold">ログイン方法</dt><dd>メールアドレスとパスワード</dd></div>
              <div><dt className="font-bold">通常ログインの追加メールOTP</dt><dd>使用していません。新規登録のメール確認とパスワード再設定メールは引き続き利用できます。</dd></div>
              <div><dt className="font-bold">ボット対策（Webログイン画面）</dt><dd>{overview.botProtection === 'enabled' ? '有効' : overview.botProtection === 'disabled' ? '無効' : overview.botProtection === 'test' ? '有効（テスト用の確認設定）' : '有効ですが、確認設定に問題があります。管理担当者に確認してください。'}</dd><dd className="mt-1 text-sm text-slate-500">Webログイン画面の現在の設定です。認証サービス側の追加確認は別に適用されます。{overview.botProtection === 'test' ? 'テスト用の設定は、本番用のボット判定が動作していることを示すものではありません。' : ''}</dd></div>
              <div><dt className="font-bold">ログイン失敗時の制限</dt><dd>{overview.loginRestriction === 'unavailable' ? '現在の状態を確認できませんでした。開き直して確認してください。' : overview.loginRestriction === 'locked' ? '有効：現在、このアカウントの再ログインは一時停止中です。時間をおいて再試行してください。' : '有効：現在、このアカウントの再ログインは一時停止されていません。'}</dd><dd className="mt-1 text-sm text-slate-500">パスワードの誤入力が続くと、ログインを一定時間制限します。</dd></div>
            </dl>
          </section>
          <nav aria-label="セキュリティの管理" className="grid gap-3 sm:grid-cols-3">
            <Link href="/forgot-password" className="rounded-xl border border-slate-300 bg-white p-4 font-bold text-blue-700">パスワードの変更・再設定</Link>
            <Link href="/settings/members" className="rounded-xl border border-slate-300 bg-white p-4 font-bold text-blue-700">メンバー・権限を管理</Link>
            <Link href="/settings/audit-logs" className="rounded-xl border border-slate-300 bg-white p-4 font-bold text-blue-700">監査ログを確認</Link>
          </nav>
        </div>
      )}
    </AppShell>
  );
}
