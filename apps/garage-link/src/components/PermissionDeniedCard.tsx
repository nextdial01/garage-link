import Link from 'next/link';

export default function PermissionDeniedCard({
  title = '権限がありません',
  message = 'この機能を利用する権限がありません。管理者に確認してください。',
  backHref = '/dashboard',
}: {
  title?: string;
  message?: string;
  backHref?: string;
}) {
  const backLabel = backHref === '/settings' ? '設定トップへ戻る' : 'ダッシュボードへ戻る';

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-lg font-bold text-red-600">
        !
      </div>
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>
      <Link
        href={backHref}
        className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
      >
        {backLabel}
      </Link>
    </section>
  );
}
