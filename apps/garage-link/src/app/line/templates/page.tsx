'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'テンプレート名', required: true, placeholder: '例：新入荷車両紹介' },
  {
    name: 'template_type',
    label: '種別',
    type: 'select',
    defaultValue: 'text',
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
  { name: 'category', label: 'カテゴリ', placeholder: '例：車両紹介' },
  { name: 'variables', label: '差し込み変数', type: 'tags', placeholder: '例：顧客名, 車両名, 見積URL' },
  { name: 'is_active', label: '有効/無効', type: 'boolean', defaultValue: 'true' },
  { name: 'body', label: '本文', type: 'textarea', required: true, placeholder: '例：{{顧客名}}様、新入荷車両をご案内します。' },
];

const columns: LineCrudColumn[] = [
  { key: 'name', label: 'テンプレート名' },
  { key: 'template_type', label: '種別' },
  { key: 'category', label: 'カテゴリ' },
  { key: 'variables', label: '変数', type: 'tags' },
  { key: 'is_active', label: '状態', type: 'boolean' },
  { key: 'updated_at', label: '最終更新', type: 'datetime' },
];

export default function LineTemplatesPage() {
  return (
    <LineCrudPage
      title="テンプレート"
      description="LINE配信で利用する定型文と差し込み変数を管理します。"
      tableName="line_templates"
      formTitle="新規テンプレート作成"
      tableTitle="テンプレート一覧"
      emptyMessage="テンプレートはまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['name', 'category', 'body', 'template_type']}
      statsBuilder={(rows) => [
        { label: 'テンプレート数', value: String(rows.length) },
        { label: '有効', value: String(rows.filter((row) => row.is_active === true).length) },
        { label: '車両提案', value: String(rows.filter((row) => row.template_type === 'vehicle_proposal').length) },
        { label: 'フォロー', value: String(rows.filter((row) => row.template_type === 'follow_up').length) },
      ]}
      helperText="本文プレビューは入力欄の下に表示されます。実送信は後工程でLINE APIと接続します。"
      categories={['未分類', '見積書案内', '請求書案内', '車両提案', '来店予約', '車検案内', 'フォローアップ', '自由入力']}
      detailBasePath="/line/templates"
      primaryActionLabel="新規作成"
      preview={(formData) => (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">本文プレビュー</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{formData.body || '本文を入力するとここにプレビューが表示されます。'}</p>
        </div>
      )}
    />
  );
}
