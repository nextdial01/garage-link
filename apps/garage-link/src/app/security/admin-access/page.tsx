import { AdminAccessForm } from './AdminAccessForm';
import { secureReturnPath } from '@/lib/security/adminAccess';

export default async function AdminAccessPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const returnPath = secureReturnPath(typeof params.from === 'string' ? params.from : null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-950">
      <section className="w-full max-w-md rounded-[22px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_55px_rgba(15,35,70,0.10)] sm:p-9">
        <p className="text-xs font-bold text-sky-700">管理者専用</p>
        <h1 className="mt-2 text-xl font-black text-[#061735]">追加アクセス確認</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">MFAに加えて、管理者専用コードで画面を保護します。初回は12文字以上のコードを設定してください。</p>
        <AdminAccessForm returnPath={returnPath} />
      </section>
    </main>
  );
}
