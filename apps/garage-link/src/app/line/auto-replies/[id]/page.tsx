'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: '応答名', required: true },
  { name: 'trigger_keyword', label: 'キーワード' },
  {
    name: 'match_type',
    label: '一致条件',
    type: 'select',
    options: [
      { label: '完全一致', value: 'exact' },
      { label: '含む', value: 'contains' },
      { label: '前方一致', value: 'starts_with' },
      { label: '正規表現', value: 'regex' },
    ],
  },
  { name: 'priority', label: '優先度', type: 'number' },
  { name: 'is_active', label: '有効/無効', type: 'boolean' },
  { name: 'response_body', label: '応答本文', type: 'textarea', required: true },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

export default function LineAutoReplyDetailPage() {
  return (
    <LineRecordDetailPage
      title="自動応答詳細"
      description="自動応答ルールの条件と返信内容を確認・編集します。"
      tableName="line_auto_replies"
      listPath="/line/auto-replies"
      fields={fields}
      nameKey="name"
    />
  );
}
