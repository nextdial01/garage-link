import { ModuleListPage } from '../_components/LineModule';

const stats = [
  { label: '本日予約', value: '5' },
  { label: '今週予約', value: '28' },
  { label: '未対応', value: '3' },
  { label: '完了', value: '112' },
];

const columns = [
  { key: 'reservedAt', label: '予約日時' },
  { key: 'customerName', label: '顧客名' },
  { key: 'type', label: '予約種別' },
  { key: 'vehicle', label: '対象車両' },
  { key: 'status', label: 'ステータス' },
  { key: 'staff', label: '担当者' },
  { key: 'action', label: '操作' },
];

const rows = [
  { reservedAt: '2026-06-02 10:00', customerName: '山田 太郎', type: '来店予約', vehicle: 'CB400SF', status: '配信予定', staff: '佐藤', action: '詳細' },
  { reservedAt: '2026-06-02 13:30', customerName: '鈴木 花子', type: '試乗予約', vehicle: 'XSR900', status: '配信予定', staff: '田中', action: '詳細' },
  { reservedAt: '2026-06-03 11:00', customerName: '高橋 健', type: '商談予約', vehicle: 'ハーレー XL883', status: '配信予定', staff: '佐藤', action: '詳細' },
  { reservedAt: '2026-06-04 15:00', customerName: '伊藤 真理', type: '整備予約', vehicle: 'Ninja 400', status: '商談中', staff: '鈴木', action: '詳細' },
];

export default function LineReservationsPage() {
  return (
    <ModuleListPage
      title="予約管理"
      description="LINEフォームから入った来店・試乗・商談・整備予約を管理します"
      stats={stats}
      tableTitle="予約一覧"
      columns={columns}
      rows={rows}
    />
  );
}
