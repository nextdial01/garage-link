import Link from 'next/link';
import AppShell from '@/components/AppShell';

function StatusBadge({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${
        ready
          ? 'bg-green-50 text-green-700 ring-green-600/20'
          : 'bg-red-50 text-red-700 ring-red-600/20'
      }`}
    >
      {ready ? '設定済み' : '未設定'}
    </span>
  );
}

export default function SupabaseTestPage() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const isReady = hasSupabaseUrl && hasSupabaseAnonKey;

  return (
    <AppShell
      activeLabel="設定"
      title="Supabase接続確認"
      description="環境変数が正しく設定されているか確認します"
      actionButton={
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ダッシュボードへ戻る
        </Link>
      }
    >
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h3 className="text-lg font-bold text-slate-950">
            接続準備チェック
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            値そのものは表示せず、設定有無だけを確認します。
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
            <div>
              <p className="text-sm font-bold text-slate-950">Supabase URL</p>
              <p className="mt-1 text-sm text-slate-500">
                NEXT_PUBLIC_SUPABASE_URL
              </p>
            </div>
            <StatusBadge ready={hasSupabaseUrl} />
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
            <div>
              <p className="text-sm font-bold text-slate-950">
                Supabase Anon Key
              </p>
              <p className="mt-1 text-sm text-slate-500">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </p>
            </div>
            <StatusBadge ready={hasSupabaseAnonKey} />
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
            <div>
              <p className="text-sm font-bold text-slate-950">接続準備</p>
              <p className="mt-1 text-sm text-slate-500">
                公開URLとAnon Keyが両方設定されているか確認します。
              </p>
            </div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${
                isReady
                  ? 'bg-green-50 text-green-700 ring-green-600/20'
                  : 'bg-red-50 text-red-700 ring-red-600/20'
              }`}
            >
              {isReady ? 'OK' : '未設定'}
            </span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
