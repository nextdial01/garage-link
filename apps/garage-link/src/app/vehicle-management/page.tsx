import Link from 'next/link';
import AppShell from '@/components/AppShell';

const cards = [
  {
    title: '車両一覧',
    href: '/vehicles',
    description: '在庫車両、価格、ステータス、保管場所を確認します。',
  },
  {
    title: '車両登録',
    href: '/vehicles/new',
    description: '車両台帳・仕入価格・販売価格・古物情報を登録します。',
  },
  {
    title: '顧客管理',
    href: '/customers',
    description: '顧客情報、希望条件、LINE連携情報を管理します。',
  },
  {
    title: '商談管理',
    href: '/deals',
    description: '顧客・車両・見積書・請求書・LINE案内を商談単位で管理します。',
  },
  {
    title: '整備・車検',
    href: '/maintenance',
    description: '整備受付、作業状況、車検案内を管理します。',
  },
  {
    title: '棚卸し',
    href: '/inventory-counts',
    description: '在庫確認、棚卸し履歴、差異確認を行います。',
  },
  {
    title: '分析',
    href: '/analytics',
    description: '在庫、商談、顧客、LINE反応を分析します。',
  },
];

export default function VehicleManagementPage() {
  return (
    <AppShell
      activeLabel="車両管理"
      title="車両管理"
      description="車両販売業務の主要メニューを確認します"
      actionButton={
        <Link
          href="/vehicles/new"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          車両を登録
        </Link>
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h3 className="text-lg font-bold text-slate-950">車両管理メニュー</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            在庫車両から商談、整備、棚卸し、分析までの導線をまとめています。
          </p>
        </div>

        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-base font-bold text-slate-950">{card.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
                </div>
                <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500 transition group-hover:bg-blue-600 group-hover:text-white">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
