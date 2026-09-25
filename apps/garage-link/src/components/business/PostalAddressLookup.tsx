'use client';

import { useEffect, useRef, useState } from 'react';
import { lookupPostalAddress, normalizePostalCode } from '@/lib/business/customer';

/** Never replace a saved/manual address on mount or after the user edits it. */
export default function PostalAddressLookup({ postalCode, address, onAddress }: { postalCode: string; address: string; onAddress: (value: string) => void }) {
  const [message, setMessage] = useState('');
  const [choices, setChoices] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const previous = useRef(normalizePostalCode(postalCode));
  const latest = useRef({ postalCode, address, onAddress });
  useEffect(() => { latest.current = { postalCode, address, onAddress }; }, [postalCode, address, onAddress]);
  useEffect(() => {
    const code = normalizePostalCode(postalCode);
    const changed = previous.current !== code;
    previous.current = code;
    if (!/^\d{7}$/.test(code) || (!changed && attempt === 0)) return;
    const controller = new AbortController();
    const startedAddress = latest.current.address;
    const timer = setTimeout(() => {
      setMessage('住所を検索しています…');
      lookupPostalAddress(code, controller.signal).then((addresses) => {
        if (controller.signal.aborted || normalizePostalCode(latest.current.postalCode) !== code) return;
        setChoices(addresses);
        if (addresses.length === 1 && latest.current.address === startedAddress) {
          latest.current.onAddress(addresses[0]);
          setMessage('番地・建物名を追記してください。住所は自由に修正できます。');
        } else setMessage('検索結果を選ぶか、住所を手入力してください。');
      }).catch(() => { if (!controller.signal.aborted) setMessage('住所を取得できませんでした。手入力のまま保存できます。'); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [postalCode, attempt]);
  return <div className="mt-2 text-sm">
    <button type="button" className="font-bold text-blue-700 underline" disabled={!/^\d{7}$/.test(normalizePostalCode(postalCode))} onClick={() => setAttempt((value) => value + 1)}>郵便番号から住所を検索</button>
    {message && <p role="status" className="mt-1 text-slate-600">{message}</p>}
    {choices.length > 1 && <select aria-label="住所候補" defaultValue="" onChange={(event) => onAddress(event.target.value)}><option value="">住所を選択</option>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select>}
  </div>;
}
