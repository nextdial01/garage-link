import { useState } from 'react';
import { Text } from 'react-native';
import { lookupPostalAddress } from '../../garage-link/src/lib/business/customer';
import { Button, Choice, Field } from './v2/Ui';
export default function MobilePostalAddress({ postalCode, address, onPostalCode, onAddress }: { postalCode: string; address: string; onPostalCode: (value: string) => void; onAddress: (value: string) => void }) {
  const [message, setMessage] = useState('');
  const [choices, setChoices] = useState<string[]>([]);
  async function search() {
    try { const result = await lookupPostalAddress(postalCode); setChoices(result); if (result.length === 1) onAddress(result[0]); setMessage('番地・建物名を追記してください。'); }
    catch { setMessage('取得できませんでした。住所を手入力して保存できます。'); }
  }
  return <><Field label="郵便番号" value={postalCode} onChange={onPostalCode} /><Button title="郵便番号から住所を検索" secondary onPress={() => void search()} />{message ? <Text>{message}</Text> : null}{choices.length > 1 && <Choice label="住所候補" value={address} options={choices.map((value) => ({ value, label: value }))} onChange={onAddress} />}<Field label="住所・番地・建物名" value={address} onChange={onAddress} /></>;
}
