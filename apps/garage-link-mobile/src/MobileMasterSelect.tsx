import { useEffect, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { mobileApi, type MasterEntry } from './mobileApi';
export default function MobileMasterSelect({ storeId, kind = 'vehicle_maker', value, onChange }: { storeId: string; kind?: string; value: string; onChange: (value: string) => void }) {
  const requestKey = `${storeId}:${kind}`;
  const [result, setResult] = useState<{key:string;entries:MasterEntry[];error:string} | null>(null);
  useEffect(() => {
    let active = true;
    mobileApi.masters(storeId).then((rows) => { if (active) setResult({key:requestKey,entries:rows.filter((row) => row.kind === kind),error:''}); })
      .catch(() => { if (active) setResult({key:requestKey,entries:[],error:'マスターを取得できませんでした。画面を開き直してください。'}); });
    return () => { active = false; };
  }, [storeId, kind, requestKey]);
  const loading = result?.key !== requestKey;
  const entries = loading ? [] : result?.entries ?? [];
  const error = loading ? '' : result?.error ?? '';
  const options = entries.filter((entry) => entry.is_active);
  const settingsUrl = process.env.EXPO_PUBLIC_APP_BASE_URL?.replace(/\/$/, '') + '/settings/masters';
  return <View style={{ gap: 8 }}>
    {loading && <Text>読み込み中…</Text>}
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    {value && !options.some((entry) => entry.label === value) ? <Text>現在の値: {value}</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map((entry) => <TouchableOpacity key={entry.id} accessibilityRole="button" accessibilityState={{ selected: value === entry.label }} onPress={() => onChange(entry.label)} style={{ borderWidth: 1, borderColor: value === entry.label ? '#2563eb' : '#94a3b8', backgroundColor: value === entry.label ? '#dbeafe' : '#fff', borderRadius: 8, padding: 12 }}><Text>{entry.label}</Text></TouchableOpacity>)}</View>
    {!loading && !error && !options.length && <><Text>設定 ＞ マスター管理で{kind === 'vehicle_maker' ? 'メーカー' : '項目'}を登録してください。</Text>{process.env.EXPO_PUBLIC_APP_BASE_URL && <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL(settingsUrl); }}><Text style={{ color: '#2563eb' }}>マスター管理を開く</Text></TouchableOpacity>}</>}
  </View>;
}
