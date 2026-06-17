'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'シナリオ名', required: true },
  {
    name: 'trigger_type',
    label: 'トリガー',
    type: 'select',
    options: [
      { label: '友だち追加', value: 'friend_added' },
      { label: 'タグ付与', value: 'tag_added' },
      { label: 'フォーム送信', value: 'form_submitted' },
      { label: '商談ステータス変更', value: 'deal_status_changed' },
      { label: '手動', value: 'manual' },
    ],
  },
  {
    name: 'status',
    label: 'ステータス',
    type: 'select',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '稼働中', value: 'active' },
      { label: '停止中', value: 'paused' },
      { label: 'アーカイブ', value: 'archived' },
    ],
  },
  { name: 'is_active', label: '有効/無効', type: 'boolean' },
  { name: 'description', label: '説明', type: 'textarea' },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

export default function LineStepDetailPage() {
  return (
    <LineRecordDetailPage
      title="シナリオ詳細"
      description="シナリオの基本情報とステップメッセージを確認・編集します。"
      tableName="line_steps"
      listPath="/line/steps"
      fields={fields}
      nameKey="name"
    />
  );
}
