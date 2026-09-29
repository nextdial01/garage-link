'use client';

import Link from 'next/link';
import { MASTER_KINDS, masterOptions, type MasterKind } from '@/lib/business/masters';
import { useBusinessSettings } from '@/lib/business/useBusinessSettings';

export default function MasterSelect({ id, kind, value, onChange, required = false, disabled = false, className = '' }: { id?: string; kind: MasterKind; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean; className?: string }) {
  const settings = useBusinessSettings();
  const options = masterOptions(settings.entries, kind, value);
  const hasActive = settings.entries.some((entry) => entry.kind === kind && entry.is_active);
  return <div>
    <select id={id} aria-label={MASTER_KINDS[kind]} className={className} value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled || settings.loading || Boolean(settings.error)}>
      <option value="">{settings.loading ? '読み込み中…' : '選択してください'}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {settings.error && <p role="alert" className="mt-2 text-sm text-red-700">{settings.error}</p>}
    {!settings.loading && !settings.error && !hasActive && <p className="mt-2 text-sm text-slate-600">設定 ＞ マスター管理で{kind === 'vehicle_maker' ? 'メーカー' : MASTER_KINDS[kind]}を登録してください。 <Link className="font-bold text-blue-700 underline" href="/settings/masters">マスター管理を開く</Link></p>}
  </div>;
}
