'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'title', label: 'タイトル', required: true, placeholder: '例：6月新入荷バイク案内' },
  {
    name: 'message_type',
    label: 'メッセージ種別',
    type: 'select',
    defaultValue: 'text',
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
    defaultValue: 'all',
    options: [
      { label: '全員', value: 'all' },
      { label: 'タグを含む', value: 'include_tags' },
      { label: 'タグを除外', value: 'exclude_tags' },
    ],
  },
  { name: 'target_tags', label: '対象タグ', type: 'tags', placeholder: '例：購入検討中, ハーレー希望' },
  { name: 'exclude_tags', label: '除外タグ', type: 'tags', placeholder: '例：配信停止, 失注' },
  {
    name: 'status',
    label: 'ステータス',
    type: 'select',
    defaultValue: 'draft',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '送信予約', value: 'scheduled' },
      { label: '送信中', value: 'sending' },
      { label: '送信済み', value: 'sent' },
      { label: 'キャンセル', value: 'cancelled' },
    ],
  },
  { name: 'scheduled_at', label: '送信予定日時', type: 'datetime-local' },
  { name: 'created_by', label: '作成者', placeholder: '例：山田' },
  { name: 'target_count', label: '対象人数', type: 'number', defaultValue: '0' },
  { name: 'body', label: '本文', type: 'textarea', required: true },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

const columns: LineCrudColumn[] = [
  { key: 'title', label: '配信名' },
  { key: 'target_type', label: '対象' },
  { key: 'status', label: 'ステータス', type: 'status' },
  { key: 'scheduled_at', label: '配信予定日', type: 'datetime' },
  { key: 'target_count', label: '対象数', type: 'number' },
  { key: 'sent_count', label: '送信数', type: 'number' },
];

export default function LineCampaignsPage() {
  return (
    <LineCrudPage
      title="一斉配信"
      description="対象者を絞り込んでLINEメッセージの下書き・予約を管理します。"
      tableName="line_campaigns"
      formTitle="新規配信作成"
      tableTitle="配信キャンペーン一覧"
      emptyMessage="一斉配信はまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['title', 'body', 'target_type', 'status']}
      submitLabel="下書き保存"
      statsBuilder={(rows) => [
        { label: '配信数', value: String(rows.length) },
        { label: '配信予定', value: String(rows.filter((row) => row.status === 'scheduled').length) },
        { label: '配信済み', value: String(rows.filter((row) => row.status === 'sent').length) },
        { label: '下書き', value: String(rows.filter((row) => row.status === 'draft').length) },
      ]}
      helperText="ステータスを「送信予約」にして保存すると予約配信の下書きとして管理できます。実送信はまだ行いません。"
      categories={['下書き', '予約中', '送信済み', '取消', '車両提案', '見積案内', '請求案内', '車検案内', 'キャンペーン']}
      detailBasePath="/line/campaigns"
      primaryActionLabel="新規作成"
      secondaryActionLabel="複製"
      sortLabel="検索"
      preview={(formData) => (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-green-700">配信プレビュー</p>
          <p className="mt-2 text-sm font-bold text-slate-950">{formData.title || '配信タイトル'}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{formData.body || '本文を入力してください。'}</p>
        </div>
      )}
    />
  );
}
