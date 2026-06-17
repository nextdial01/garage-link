'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'title', label: '配信名', required: true },
  {
    name: 'message_type',
    label: 'メッセージ種別',
    type: 'select',
    options: [
      { label: 'テキスト', value: 'text' },
      { label: '車両提案', value: 'vehicle_proposal' },
      { label: '見積案内', value: 'quote_notice' },
      { label: '車検案内', value: 'inspection_notice' },
    ],
  },
  {
    name: 'target_type',
    label: '対象条件',
    type: 'select',
    options: [
      { label: '全員', value: 'all' },
      { label: 'タグを含む', value: 'include_tags' },
      { label: 'タグを除外', value: 'exclude_tags' },
    ],
  },
  { name: 'target_tags', label: '対象タグ', type: 'tags' },
  { name: 'exclude_tags', label: '除外タグ', type: 'tags' },
  {
    name: 'status',
    label: 'ステータス',
    type: 'select',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '送信予約', value: 'scheduled' },
      { label: '送信中', value: 'sending' },
      { label: '送信済み', value: 'sent' },
      { label: 'キャンセル', value: 'cancelled' },
    ],
  },
  { name: 'target_count', label: '対象人数', type: 'number' },
  { name: 'body', label: '本文', type: 'textarea', required: true },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

export default function LineCampaignDetailPage() {
  return (
    <LineRecordDetailPage
      title="一斉配信詳細"
      description="一斉配信の内容、対象条件、ステータスを確認・編集します。"
      tableName="line_campaigns"
      listPath="/line/campaigns"
      fields={fields}
      nameKey="title"
    />
  );
}
