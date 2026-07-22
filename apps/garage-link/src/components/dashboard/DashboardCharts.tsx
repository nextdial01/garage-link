'use client';

export type ChartDatum = {
  label: string;
  value: number;
  color: string;
};

export type ManagementTrendDatum = {
  label: string;
  revenue: number;
  grossProfit: number;
};

function formatCompactYen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function InventoryAgeDonut({ data, thresholdDays }: { data: ChartDatum[]; thresholdDays: number }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const segments = data.map((item) => {
    const start = total > 0 ? (cursor / total) * 360 : 0;
    cursor += item.value;
    const end = total > 0 ? (cursor / total) * 360 : 0;
    return `${item.color} ${start}deg ${end}deg`;
  });
  const background = total > 0 ? `conic-gradient(${segments.join(', ')})` : '#e2e8f0';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-black text-slate-950">在庫日数</h3>
        <span className="text-xs font-bold text-slate-500">{thresholdDays}日超を要確認</span>
      </div>
      <div className="mt-5 grid items-center gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div
          role="img"
          aria-label={`在庫日数の内訳、合計${total}台`}
          className="relative mx-auto aspect-square w-36 rounded-full"
          style={{ background }}
        >
          <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
            <span className="text-3xl font-black text-slate-950">{total}</span>
            <span className="text-xs font-bold text-slate-500">在庫台数</span>
          </div>
        </div>
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-bold text-slate-700">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              <span className="font-black text-slate-950">{item.value}台</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VehicleStatusBars({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-black text-slate-950">車両状態</h3>
      <div className="mt-5 space-y-4">
        {data.map((item) => (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-slate-700">{item.label}</span>
              <span className="font-black text-slate-950">{item.value}台</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full min-w-0 rounded-full transition-[width]"
                style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ManagementTrendChart({ data }: { data: ManagementTrendDatum[] }) {
  const max = Math.max(1, ...data.flatMap((item) => [item.revenue, Math.max(0, item.grossProfit)]));
  const hasData = data.some((item) => item.revenue !== 0 || item.grossProfit !== 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-black text-slate-950">売上・粗利推移</h4>
        <div className="flex gap-3 text-xs font-bold text-slate-600">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />売上</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />粗利</span>
        </div>
      </div>
      {hasData ? (
        <div className="mt-5 flex h-52 items-end gap-3 overflow-x-auto pb-1 sm:gap-5">
          {data.map((item) => (
            <div key={item.label} className="flex h-full min-w-12 flex-1 flex-col justify-end">
              <div className="flex h-[172px] items-end justify-center gap-1.5">
                <div title={`売上 ${item.revenue.toLocaleString('ja-JP')}円`} className="w-4 rounded-t bg-blue-600 sm:w-6" style={{ height: `${Math.max(2, (item.revenue / max) * 100)}%` }} />
                <div title={`粗利 ${item.grossProfit.toLocaleString('ja-JP')}円`} className={`w-4 rounded-t sm:w-6 ${item.grossProfit < 0 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ height: `${Math.max(2, (Math.abs(item.grossProfit) / max) * 100)}%` }} />
              </div>
              <p className="mt-2 text-center text-[11px] font-bold text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm font-bold text-slate-500">
          集計できる売上データがありません
        </div>
      )}
      {hasData && (
        <p className="mt-3 text-right text-xs font-semibold text-slate-500">最大 {formatCompactYen(max)}円</p>
      )}
    </section>
  );
}
