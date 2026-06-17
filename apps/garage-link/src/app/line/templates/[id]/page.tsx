'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'テンプレート名', required: true },
  {
    name: 'template_type',
    label: '種別',
    type: 'select',
    options: [
      { label: 'テキスト', value: 'text' },
      { label: '見積案内', value: 'quote_notice' },
      { label: '請求案内', value: 'invoice_notice' },
      { label: '車両提案', value: 'vehicle_proposal' },
      { label: '車検案内', value: 'inspection_notice' },
      { label: 'フォロー', value: 'follow_up' },
      { label: 'カスタム', value: 'custom' },
    ],
  },
  { name: 'category', label: 'カテゴリ' },
  { name: 'variables', label: '差し込み変数', type: 'tags' },
  { name: 'is_active', label: '有効/無効', type: 'boolean' },
  { name: 'body', label: '本文', type: 'textarea', required: true },
];

export default function LineTemplateDetailPage() {
  return (
    <LineRecordDetailPage
      title="テンプレート詳細"
      description="テンプレート本文と差し込み変数を確認・編集します。"
      tableName="line_templates"
      listPath="/line/templates"
      fields={fields}
      nameKey="name"
    />
  );
}
