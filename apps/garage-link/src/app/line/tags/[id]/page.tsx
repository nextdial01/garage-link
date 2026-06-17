'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'タグ名', required: true },
  { name: 'color', label: '色', type: 'color', defaultValue: '#2563eb' },
  {
    name: 'tag_type',
    label: '種別',
    type: 'select',
    options: [
      { label: '手動', value: 'manual' },
      { label: '希望条件', value: 'desired_condition' },
      { label: '商談', value: 'deal' },
      { label: 'フォロー', value: 'follow_up' },
      { label: '自動', value: 'auto' },
    ],
  },
  { name: 'is_active', label: '有効/無効', type: 'boolean' },
  { name: 'description', label: '説明', type: 'textarea' },
];

export default function LineTagDetailPage() {
  return (
    <LineRecordDetailPage
      title="タグ詳細"
      description="LINEタグの基本情報を確認・編集します。"
      tableName="line_tags"
      listPath="/line/tags"
      fields={fields}
      nameKey="name"
    />
  );
}
