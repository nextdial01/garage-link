'use client';
import { MASTER_KINDS, type MasterKind } from '@/lib/business/masters';
import { useBusinessSettings } from '@/lib/business/useBusinessSettings';
export default function MasterFilter({ kind, value, onChange, existing = [] }: { kind: MasterKind; value: string; onChange: (value: string) => void; existing?: (string | null)[] }) {
  const { entries } = useBusinessSettings();
  const labels = [...new Set([...entries.filter((entry) => entry.kind === kind).map((entry) => entry.label), ...existing.filter((label): label is string => Boolean(label))])];
  return <select aria-label={`${MASTER_KINDS[kind]}で絞り込み`} className="rounded-xl border border-slate-300 p-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">すべての{MASTER_KINDS[kind]}</option>{labels.map((label) => <option key={label} value={label}>{label}</option>)}</select>;
}
