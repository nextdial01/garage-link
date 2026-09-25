'use client';
import MasterSelect from './MasterSelect';
export type VehicleDraft = { vin: string; registration_no: string; maker: string; model_name: string; inspection_expiry_date: string; liability_insurance_expiry_date: string };
export const emptyVehicle: VehicleDraft = { vin: '', registration_no: '', maker: '', model_name: '', inspection_expiry_date: '', liability_insurance_expiry_date: '' };
export default function VehicleFields({ value, onChange }: { value: VehicleDraft; onChange: (value: VehicleDraft) => void }) {
  const input = 'mt-2 w-full rounded-lg border px-3 py-2';
  return <div className="grid gap-4 sm:grid-cols-2">{([['vin', '車台番号'], ['registration_no', '登録番号'], ['maker', 'メーカー'], ['model_name', '車名'], ['inspection_expiry_date', '車検満了日'], ['liability_insurance_expiry_date', '自賠責保険満了日']] as const).map(([key, label]) => <label key={key} className="text-sm font-bold">{label}{['vin', 'maker', 'model_name'].includes(key) ? '（必須）' : ''}{key === 'maker' ? <MasterSelect kind="vehicle_maker" className={input} value={value.maker} required onChange={(maker) => onChange({ ...value, maker })} /> : <input aria-label={label} className={input} type={key.endsWith('_date') ? 'date' : 'text'} required={['vin', 'model_name'].includes(key)} value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}</label>)}</div>;
}
