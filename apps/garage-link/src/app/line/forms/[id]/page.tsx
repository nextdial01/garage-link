'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'フォーム名', required: true },
  {
    name: 'form_type',
    label: 'フォーム種別',
    type: 'select',
    options: [
      { label: '購入相談', value: 'purchase_consultation' },
      { label: '買取査定', value: 'appraisal_request' },
      { label: '車検予約', value: 'inspection_reservation' },
      { label: '整備相談', value: 'repair_request' },
      { label: '汎用', value: 'general' },
    ],
  },
  {
    name: 'status',
    label: '公開状態',
    type: 'select',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '公開中', value: 'published' },
      { label: 'アーカイブ', value: 'archived' },
    ],
  },
  { name: 'public_slug', label: '公開slug' },
  { name: 'submit_button_label', label: '送信ボタン文言' },
  { name: 'linked_tags', label: '付与タグ', type: 'tags' },
  { name: 'description', label: '説明', type: 'textarea' },
  { name: 'thanks_message', label: 'サンクスメッセージ', type: 'textarea' },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

export default function LineFormDetailPage() {
  return (
    <LineRecordDetailPage
      title="回答フォーム詳細"
      description="フォームの基本情報と質問項目を確認・編集します。"
      tableName="line_forms"
      listPath="/line/forms"
      fields={fields}
      nameKey="name"
    />
  );
}
