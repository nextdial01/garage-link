'use client';
import type { CustomerDraft } from '@/lib/business/customer';
import PostalAddressLookup from './PostalAddressLookup';

export default function CustomerFields({ value, onChange }: { value: CustomerDraft; onChange: (value: CustomerDraft) => void }) {
  const update = (key: keyof CustomerDraft, text: string) => onChange({ ...value, [key]: text });
  return <div className="grid gap-4 sm:grid-cols-2">
    {([['name', '顧客名', 'text'], ['birth_date', '生年月日', 'date'], ['postal_code', '郵便番号', 'text'], ['address', '住所・番地・建物名', 'text'], ['phone', '電話番号', 'tel'], ['email', 'メールアドレス', 'email']] as const).map(([key, label, type]) => <label key={key} className="block text-sm font-bold">{label}{['name', 'birth_date'].includes(key) ? '（必須）' : ''}<input aria-label={label} type={type} required={['name', 'birth_date'].includes(key)} className="mt-2 w-full rounded-lg border px-3 py-2" value={value[key]} onChange={(event) => update(key, event.target.value)} />{key === 'postal_code' && <PostalAddressLookup postalCode={value.postal_code} address={value.address} onAddress={(address) => update('address', address)} />}</label>)}
  </div>;
}
