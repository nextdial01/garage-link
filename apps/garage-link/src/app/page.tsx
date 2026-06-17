export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          バイク・中古車販売店向け LINE連携型SaaS
        </div>

        <p className="mb-4 text-sm font-bold tracking-[0.3em] text-blue-600">
          GARAGE LINK
        </p>

        <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl">
          LINEで在庫を商談につなげる、
          <br />
          車両販売店向けSaaS
        </h1>

        <p className="mb-10 max-w-2xl text-lg leading-8 text-slate-600">
          GARAGE LINKは、在庫登録からLINE配信、問い合わせ、商談管理、
          見積書・請求書作成までを一元化する販売店向けシステムです。
        </p>

        <a
          href="/login"
          className="rounded-xl bg-blue-600 px-8 py-4 text-center text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          ログインする
        </a>

        <p className="mt-6 text-sm text-slate-500">
          ※ ログイン後にダッシュボードへ移動します。
        </p>
      </section>
    </main>
  );
}
