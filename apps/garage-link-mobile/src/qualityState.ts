type Ticket = { scope: number; sequence: number; channel: string };

/** Response ownership is scoped to the current account/store and navigation. */
export function createRequestCoordinator() {
  let scope = 0;
  let sequence = 0;
  const latest = new Map<string, number>();
  let mutation: Ticket | null = null;
  const current = (ticket: Ticket) => ticket.scope === scope && latest.get(ticket.channel) === ticket.sequence;
  const begin = (channel: string): Ticket => {
    const ticket = { scope, channel, sequence: ++sequence };
    latest.set(channel, ticket.sequence);
    return ticket;
  };
  return {
    begin, current,
    mutationPending: () => mutation !== null,
    invalidate() { scope++; latest.clear(); mutation = null; },
    beginMutation() { if (mutation) return null; latest.delete('navigation'); mutation = begin('mutation'); return mutation; },
    finishMutation(ticket: Ticket | null) { if (ticket === mutation) mutation = null; },
  };
}

export function userFacingError(reason: unknown): string {
  const error = reason as { status?: number; code?: string; message?: string } | null;
  const message = error?.message ?? '';
  if (error?.code === 'photo_permission') return '写真へのアクセスが許可されていません。端末の設定から許可して、もう一度お試しください。';
  if (error?.code === 'share_unavailable') return 'この端末では共有機能を利用できません。印刷をお試しください。';
  if (error?.code === 'invalid_base_url') return 'アプリの接続先を確認できません。管理者へお問い合わせください。';
  if (error?.code === 'timeout' || error?.code === 'network_error' || /network request failed|failed to fetch/i.test(message)) return '通信に時間がかかっています。接続を確認して再試行してください。';
  if (/invalid login credentials/i.test(message)) return 'メールアドレスまたはパスワードが正しくありません。';
  if (error?.status === 401 || /jwt|not authenticated|unauthorized|ログインが必要/i.test(message)) return 'ログインの有効期限が切れました。ログアウトして、もう一度ログインしてください。';
  if (error?.code?.startsWith('forbidden_store') || error?.code === 'forbidden_resolved_store' || error?.code === 'forbidden_scope') return 'この店舗の所属情報を確認できません。店舗を選び直すか、管理者へお問い合わせください。';
  if (error?.status === 403 || /permission|forbidden|access denied/i.test(message)) return 'この操作を行う権限がありません。管理者へお問い合わせください。';
  if (error?.status === 429) return '操作が集中しています。少し待ってから再試行してください。';
  return '処理を完了できませんでした。入力内容を保持しています。もう一度お試しください。';
}

export function parentTab(page: string) {
  return ({ vehicleDetail: 'vehicles', maintenanceDetail: 'maintenance', customerDetail: 'customers', quoteCreate: 'quotes', quotePreview: 'quotes' } as Record<string, string>)[page] ?? page;
}

export function quoteVehicleId(selected: string, vehicles: { id: string }[]): string | undefined {
  if (!selected) return undefined;
  if (!vehicles.some((vehicle) => vehicle.id === selected)) throw new Error('Vehicle is not associated with selected customer');
  return selected;
}

export const buttonLayout = { flexGrow: 0, flexShrink: 0, minHeight: 48, paddingVertical: 12 } as const;

/** Overlapping pages cannot duplicate a row after an intervening update. */
export function mergePage<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const rows = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) rows.set(item.id, item);
  return [...rows.values()];
}
