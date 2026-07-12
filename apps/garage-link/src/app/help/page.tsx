import Link from 'next/link';

const faqItems = [
  {
    question: '無料プランですぐ使えますか？',
    answer: 'はい。アカウント作成後、そのままFreeプランで使い始められます。',
  },
  {
    question: '有料プランはどう始まりますか？',
    answer: 'アプリ内の「プラン・契約」から申込できます。現在は担当者確認後に反映します。',
  },
  {
    question: '最初に何をすればよいですか？',
    answer: 'まずは車両を1台登録してください。次に会社情報と帳票設定を入れると、見積や請求が進めやすくなります。',
  },
  {
    question: 'LINE運用はGARAGE LINKでできますか？',
    answer: 'LINEの直接運用機能はL-LINKへ移行しています。GARAGE LINKでは車両・顧客・商談・帳票管理を中心に使います。',
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <section className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-bold tracking-[0.2em] text-blue-600">HELP</p>
          <h1 className="mt-2 text-3xl font-black">はじめての方向けヘルプ</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            よくある質問と、最初に迷いやすいポイントをまとめています。
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-sm font-bold text-blue-900">まず見る場所</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">
              アカウント作成
            </Link>
            <Link href="/login" className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700">
              ログイン
            </Link>
            <Link href="/legal/terms" className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700">
              利用規約
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {faqItems.map((item) => (
            <section key={item.question} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-black">{item.question}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{item.answer}</p>
            </section>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black">次の操作</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            ログイン後は、`車両一覧` ではなく `車両を登録` から始めるとスムーズです。会社ロゴや帳票設定はあとから追加できます。
          </p>
        </div>
      </section>
    </main>
  );
}
