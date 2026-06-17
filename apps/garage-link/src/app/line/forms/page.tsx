'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'フォーム名', required: true, placeholder: '例：見積依頼フォーム' },
  {
    name: 'form_type',
    label: 'フォーム種別',
    type: 'select',
    defaultValue: 'general',
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
    defaultValue: 'draft',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '公開中', value: 'published' },
      { label: 'アーカイブ', value: 'archived' },
    ],
  },
  { name: 'public_slug', label: '公開slug', placeholder: '例：quote-request' },
  { name: 'submit_button_label', label: '送信ボタン文言', defaultValue: '送信する' },
  { name: 'linked_tags', label: '付与タグ', type: 'tags', placeholder: '例：見積依頼, 購入検討中' },
  { name: 'description', label: '説明', type: 'textarea' },
  { name: 'thanks_message', label: 'サンクスメッセージ', type: 'textarea', placeholder: '例：送信ありがとうございます。担当者よりご連絡します。' },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
  { name: 'question_label', label: '質問ラベル', placeholder: '例：希望車種', persist: false },
  {
    name: 'question_field_type',
    label: '質問タイプ',
    type: 'select',
    defaultValue: 'text',
    persist: false,
    options: [
      { label: 'テキスト', value: 'text' },
      { label: '複数行', value: 'textarea' },
      { label: '選択', value: 'select' },
      { label: 'ラジオ', value: 'radio' },
      { label: 'チェックボックス', value: 'checkbox' },
      { label: '日付', value: 'date' },
      { label: '時間', value: 'time' },
      { label: '数値', value: 'number' },
      { label: '電話番号', value: 'phone' },
      { label: 'メール', value: 'email' },
    ],
  },
  { name: 'question_required', label: '必須', type: 'boolean', defaultValue: 'false', persist: false },
  { name: 'question_options', label: '選択肢', type: 'tags', placeholder: '例：すぐ, 1ヶ月以内, 未定', persist: false },
];

const columns: LineCrudColumn[] = [
  { key: 'name', label: 'フォーム名' },
  { key: 'form_type', label: '用途' },
  { key: 'status', label: '公開状態', type: 'status' },
  { key: 'public_slug', label: 'slug' },
  { key: 'linked_tags', label: 'タグ', type: 'tags' },
  { key: 'updated_at', label: '最終更新', type: 'datetime' },
];

export default function LineFormsPage() {
  return (
    <LineCrudPage
      title="回答フォーム"
      description="見積依頼、来店予約、買取査定、整備相談などのフォームを管理します。"
      tableName="line_forms"
      formTitle="新規フォーム作成"
      tableTitle="フォーム一覧"
      emptyMessage="フォームはまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['name', 'description', 'form_type', 'public_slug']}
      statsBuilder={(rows) => [
        { label: 'フォーム数', value: String(rows.length) },
        { label: '公開中', value: String(rows.filter((row) => row.status === 'published').length) },
        { label: '下書き', value: String(rows.filter((row) => row.status === 'draft').length) },
        { label: 'アーカイブ', value: String(rows.filter((row) => row.status === 'archived').length) },
      ]}
      helperText="フォーム本体と最初の質問を登録できます。公開フォーム画面は後工程で作成します。"
      categories={['未分類', '査定依頼', '購入相談', '車検予約', '修理依頼', 'カスタム相談', 'アンケート']}
      detailBasePath="/line/forms"
      primaryActionLabel="新規作成"
      afterCreate={async (supabase, createdRow, storeId, formData) => {
        if (!formData.question_label?.trim()) {
          return;
        }

        const options = formData.question_options
          ? formData.question_options.split(',').map((option) => option.trim()).filter(Boolean)
          : [];

        const { error } = await supabase.from('line_form_questions').insert({
          store_id: storeId,
          form_id: createdRow.id,
          question_order: 1,
          label: formData.question_label,
          field_type: formData.question_field_type || 'text',
          required: formData.question_required === 'true',
          options: options.length > 0 ? options : null,
        });

        if (error) {
          throw new Error(error.message);
        }
      }}
    />
  );
}
