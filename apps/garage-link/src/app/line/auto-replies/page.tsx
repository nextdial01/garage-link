'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'ルール名', required: true, placeholder: '例：営業時間外応答' },
  { name: 'trigger_keyword', label: 'キーワード', placeholder: '例：営業時間, 在庫, 車検' },
  {
    name: 'match_type',
    label: '一致条件',
    type: 'select',
    defaultValue: 'contains',
    options: [
      { label: '完全一致', value: 'exact' },
      { label: '含む', value: 'contains' },
      { label: '前方一致', value: 'starts_with' },
      { label: '正規表現', value: 'regex' },
    ],
  },
  { name: 'priority', label: '優先度', type: 'number', defaultValue: '0' },
  { name: 'is_active', label: '有効/無効', type: 'boolean', defaultValue: 'true' },
  { name: 'response_body', label: '応答本文', type: 'textarea', required: true, placeholder: '例：お問い合わせありがとうございます。担当者よりご連絡します。' },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

const columns: LineCrudColumn[] = [
  { key: 'name', label: 'ルール名' },
  { key: 'trigger_keyword', label: 'キーワード' },
  { key: 'match_type', label: '一致条件' },
  { key: 'priority', label: '優先度', type: 'number' },
  { key: 'is_active', label: '状態', type: 'boolean' },
];

export default function LineAutoRepliesPage() {
  return (
    <LineCrudPage
      title="自動応答"
      description="キーワードに応じたLINEの自動返信ルールを管理します。"
      tableName="line_auto_replies"
      formTitle="新規自動応答作成"
      tableTitle="自動応答一覧"
      emptyMessage="自動応答はまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['name', 'trigger_keyword', 'response_body']}
      statsBuilder={(rows) => [
        { label: 'ルール数', value: String(rows.length) },
        { label: '有効', value: String(rows.filter((row) => row.is_active === true).length) },
        { label: '無効', value: String(rows.filter((row) => row.is_active === false).length) },
        { label: '高優先度', value: String(rows.filter((row) => typeof row.priority === 'number' && row.priority > 0).length) },
      ]}
      helperText="Webhook連携時にこのルールを参照する予定です。今回は保存・管理のみ行います。"
      categories={['未分類', 'よくある質問', '営業時間', '査定', '車検', '修理', '在庫確認', '予約']}
      detailBasePath="/line/auto-replies"
      primaryActionLabel="新規作成"
      preview={(formData) => (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-green-700">返信プレビュー</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{formData.response_body || '応答本文を入力してください。'}</p>
        </div>
      )}
    />
  );
}
