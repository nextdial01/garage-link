type LineMetricCardProps = {
  label: string;
  value: string;
  note?: string;
};

export default function LineMetricCard({ label, value, note }: LineMetricCardProps) {
  return (
    <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
      {note && <p className="mt-2 text-xs font-semibold text-green-700">{note}</p>}
    </div>
  );
}
