export type CustomerDraft = { name: string; birth_date: string; postal_code: string; address: string; phone: string; email: string };
export const emptyCustomer: CustomerDraft = { name: '', birth_date: '', postal_code: '', address: '', phone: '', email: '' };

export function validateCustomer(value: { name: string; birth_date: string }) {
  if (!value.name.trim()) throw new Error('顧客名を入力してください。');
  const date = value.birth_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10)) {
    throw new Error('生年月日を正しい日付で入力してください。');
  }
}

export function normalizePostalCode(value: string) { return value.replace(/[\s-]/g, ''); }
export async function lookupPostalAddress(postalCode: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<string[]> {
  const code = normalizePostalCode(postalCode);
  if (!/^\d{7}$/.test(code)) throw new Error('郵便番号を7桁で入力してください。');
  const response = await fetcher(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`, { signal });
  if (!response.ok) throw new Error('住所を取得できませんでした。手入力できます。');
  const result = await response.json() as { status?: number; results?: { address1?: string; address2?: string; address3?: string }[] | null };
  if (result.status !== 200 || !result.results?.length) throw new Error('住所が見つかりませんでした。手入力できます。');
  return [...new Set(result.results.map((row) => `${row.address1 ?? ''}${row.address2 ?? ''}${row.address3 ?? ''}`).filter(Boolean))];
}
