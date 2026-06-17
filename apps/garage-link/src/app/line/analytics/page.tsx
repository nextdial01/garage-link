import {
  DataTable,
  LineModuleShell,
  Notice,
  StatCards,
} from '../_components/LineModule';

const stats = [
  { label: '配信数', value: '3,420' },
  { label: 'クリック数', value: '684' },
  { label: 'フォーム回答数', value: '126' },
  { label: '商談化数', value: '34' },
];

const analysisCards = [
  { title: 'クリック率', value: '20.0%', description: '前月比 +2.4pt' },
  { title: '回答率', value: '3.7%', description: '見積依頼と来店予約が中心' },
  { title: '商談化率', value: '27.0%', description: 'フォーム回答からの商談化' },
];

const columns = [
  { key: 'name', label: '配信名' },
  { key: 'sentCount', label: '送信数' },
  { key: 'clickCount', label: 'クリック数' },
  { key: 'answers', label: 'フォーム回答' },
  { key: 'deals', label: '商談化' },
  { key: 'contracts', label: '成約' },
];

const rows = [
  { name: '6月新入荷バイク案内', sentCount: '642', clickCount: '148', answers: '31', deals: '9', contracts: '2' },
  { name: 'ハーレー在庫値下げ案内', sentCount: '186', clickCount: '62', answers: '14', deals: '5', contracts: '1' },
  { name: '車検満了前フォロー', sentCount: '312', clickCount: '74', answers: '22', deals: '8', contracts: '3' },
  { name: '買取査定キャンペーン', sentCount: '428', clickCount: '95', answers: '26', deals: '7', contracts: '1' },
];

export default function LineAnalyticsPage() {
  return (
    <LineModuleShell
      title="LINE分析"
      description="配信成果、クリック、フォーム回答、商談化を確認します"
    >
      <StatCards stats={stats} />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {analysisCards.map((card) => (
          <section
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-500">
              {card.title}
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-950">
              {card.value}
            </p>
            <p className="mt-2 text-sm text-slate-500">{card.description}</p>
          </section>
        ))}
      </div>

      <DataTable
        title="配信別パフォーマンス"
        columns={columns}
        rows={rows}
      />
      <Notice />
    </LineModuleShell>
  );
}
