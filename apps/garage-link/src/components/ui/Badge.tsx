import type { ReactNode } from 'react';

type BadgeTone = 'default' | 'blue' | 'green' | 'orange' | 'red' | 'slate';

const toneClasses: Record<BadgeTone, string> = {
  default: 'bg-slate-50 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Badge({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${toneClasses[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function statusTone(value: string | null | undefined): BadgeTone {
  const normalized = value ?? '';
  const positive = ['友だち', '許可', '配信済み', '稼働中', '公開中', '表示中', '有効', '接続済み', '成約', '完了', '納車済み', '承認済み', '設定済み'];
  const warning = ['配信予定', '予約中', '商談中', '停止中', '未連携', '未接続', '未定', '見積中', '作業中', '申請中'];
  const danger = ['ブロック', '不許可', '失注', 'エラー', '無効', 'キャンセル', '未設定', '期限超過'];
  const orange = ['取消', '取消済み'];
  const slate = ['下書き'];

  if (positive.includes(normalized)) return 'green';
  if (warning.includes(normalized)) return 'blue';
  if (danger.includes(normalized)) return 'red';
  if (orange.includes(normalized)) return 'orange';
  if (slate.includes(normalized)) return 'slate';
  return 'default';
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={statusTone(value)}>{value}</Badge>;
}
