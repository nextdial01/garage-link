import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { LINE_MOVED_NOTICE_TEXT, L_LINK_SETTINGS_PATH } from '@/lib/line/lineDisabled';

// /line/*・/line-package/*・/deals/[id]/line/* など、GARAGE LINK内の
// LINE運用画面を置き換える案内。単純な404ではなく、移行理由と導線を示します。
export default function LineFeatureMovedNotice({
  activeLabel = 'LINE連携',
}: {
  activeLabel?: string;
}) {
  return (
    <AppShell
      activeLabel={activeLabel}
      title="LINEの配信はL-LINKで行います"
      description="この画面ではLINE配信を行いません。"
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="rounded-2xl border border-green-100 bg-green-50 p-6 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">LINEを使うときはL-LINKを開いてください</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">{LINE_MOVED_NOTICE_TEXT}</p>

          <div className="mt-5 rounded-xl border border-green-100 bg-white p-4">
            <p className="text-sm font-bold text-slate-700">GARAGE LINKで行うこと</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              車両・顧客・商談・見積・請求の管理を続けられます。LINE配信だけ別画面です。
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={L_LINK_SETTINGS_PATH}
              className="rounded-xl bg-green-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-green-700"
            >
              L-LINKを開く
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              車両管理へ戻る
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
