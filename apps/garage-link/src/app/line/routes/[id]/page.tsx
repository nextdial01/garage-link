'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: '経路名', required: true },
  { name: 'route_code', label: 'route_code', required: true },
  {
    name: 'route_type',
    label: '経路種別',
    type: 'select',
    options: [
      { label: '店頭QR', value: 'store_qr' },
      { label: 'Instagram', value: 'instagram' },
      { label: 'ホームページ', value: 'website' },
      { label: 'Googleビジネスプロフィール', value: 'google_business_profile' },
      { label: 'カーセンサー', value: 'carsensor' },
      { label: 'グー', value: 'goo' },
      { label: '紹介', value: 'referral' },
      { label: 'その他', value: 'other' },
      { label: 'QR', value: 'qr' },
    ],
  },
  { name: 'landing_url', label: 'landing_url' },
  { name: 'qr_image_path', label: 'QR画像パス' },
  { name: 'linked_tags', label: '付与タグ', type: 'tags' },
  { name: 'linked_step_id', label: '紐付けシナリオID' },
  { name: 'friend_count', label: '友だち数', type: 'number' },
  { name: 'is_active', label: '有効/無効', type: 'boolean' },
  { name: 'description', label: '説明', type: 'textarea' },
];

export default function LineRouteDetailPage() {
  return (
    <LineRecordDetailPage
      title="流入経路詳細"
      description="流入経路、QR/URL、付与タグを確認・編集します。"
      tableName="line_routes"
      listPath="/line/routes"
      fields={fields}
      nameKey="name"
    />
  );
}
