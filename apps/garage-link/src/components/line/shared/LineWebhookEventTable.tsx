export type LineWebhookEventTableRow = {
  id: string;
  source_user_hash: string | null;
  event_type: string | null;
  message_type: string | null;
  raw_event_hash: string | null;
  signature_valid: boolean | null;
  processed: boolean | null;
  received_at: string | null;
};

type LineWebhookEventTableProps = {
  events: LineWebhookEventTableRow[];
};

function displayValue(value: string | null | undefined) {
  return value && value.trim() !== '' ? value : '-';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return value.replace('T', ' ').slice(0, 16);
}

function booleanLabel(value: boolean | null) {
  return value ? 'はい' : 'いいえ';
}

function badgeClass(value: boolean | null) {
  return value
    ? 'bg-green-50 text-green-700 ring-green-600/20'
    : 'bg-slate-50 text-slate-700 ring-slate-600/20';
}

export default function LineWebhookEventTable({ events }: LineWebhookEventTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-4">受信日時</th>
            <th className="px-5 py-4">送信元hash</th>
            <th className="px-5 py-4">イベント種別</th>
            <th className="px-5 py-4">メッセージ種別</th>
            <th className="px-5 py-4">イベントhash</th>
            <th className="px-5 py-4">署名検証</th>
            <th className="px-5 py-4">処理済み</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((event) => (
            <tr key={event.id} className="hover:bg-green-50/60">
              <td className="px-5 py-4">{formatDateTime(event.received_at)}</td>
              <td className="px-5 py-4 font-mono text-xs">{displayValue(event.source_user_hash?.slice(0, 12))}</td>
              <td className="px-5 py-4">{displayValue(event.event_type)}</td>
              <td className="px-5 py-4">{displayValue(event.message_type)}</td>
              <td className="px-5 py-4 font-mono text-xs">{displayValue(event.raw_event_hash?.slice(0, 12))}</td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${badgeClass(event.signature_valid)}`}>
                  {booleanLabel(event.signature_valid)}
                </span>
              </td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${badgeClass(event.processed)}`}>
                  {booleanLabel(event.processed)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
