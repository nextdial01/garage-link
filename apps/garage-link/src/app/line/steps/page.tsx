'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'シナリオ名', required: true, placeholder: '例：友だち追加後フォロー' },
  {
    name: 'trigger_type',
    label: 'トリガー',
    type: 'select',
    defaultValue: 'manual',
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
    defaultValue: 'draft',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '稼働中', value: 'active' },
      { label: '停止中', value: 'paused' },
      { label: 'アーカイブ', value: 'archived' },
    ],
  },
  { name: 'is_active', label: '有効/無効', type: 'boolean', defaultValue: 'false' },
  { name: 'description', label: '説明', type: 'textarea', placeholder: 'シナリオの用途を入力します。' },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
  { name: 'message_title', label: '初回メッセージタイトル', placeholder: '例：初回あいさつ', persist: false },
  { name: 'message_order', label: 'メッセージ順序', type: 'number', defaultValue: '1', persist: false },
  { name: 'delay_amount', label: '遅延時間', type: 'number', defaultValue: '0', persist: false },
  {
    name: 'delay_unit',
    label: '遅延単位',
    type: 'select',
    defaultValue: 'days',
    persist: false,
    options: [
      { label: '分', value: 'minutes' },
      { label: '時間', value: 'hours' },
      { label: '日', value: 'days' },
    ],
  },
  { name: 'message_body', label: '初回メッセージ本文', type: 'textarea', placeholder: '例：友だち追加ありがとうございます。', persist: false },
];

const columns: LineCrudColumn[] = [
  { key: 'name', label: 'ステップ名' },
  { key: 'trigger_type', label: '開始条件' },
  { key: 'status', label: 'ステータス', type: 'status' },
  { key: 'is_active', label: '有効', type: 'boolean' },
  { key: 'updated_at', label: '最終更新', type: 'datetime' },
];

export default function LineStepsPage() {
  return (
    <LineCrudPage
      title="シナリオ配信"
      description="友だち追加後や商談状況に応じたステップ配信を管理します。"
      tableName="line_steps"
      formTitle="新規シナリオ作成"
      tableTitle="シナリオ一覧"
      emptyMessage="シナリオはまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['name', 'description', 'trigger_type', 'status']}
      statsBuilder={(rows) => [
        { label: 'シナリオ数', value: String(rows.length) },
        { label: '稼働中', value: String(rows.filter((row) => row.status === 'active').length) },
        { label: '停止中', value: String(rows.filter((row) => row.status === 'paused').length) },
        { label: '下書き', value: String(rows.filter((row) => row.status === 'draft').length) },
      ]}
      helperText="まずはシナリオ本体と初回メッセージを同時に登録できます。詳細な分岐条件は後工程で拡張します。"
      categories={['未分類', '友だち追加後', '買取シナリオ', '購入後シナリオ', '車検案内', '修理後フォロー', '商談フォロー', '休眠顧客掘り起こし']}
      detailBasePath="/line/steps"
      primaryActionLabel="新規作成"
      afterCreate={async (supabase, createdRow, storeId, formData) => {
        if (!formData.message_body?.trim()) {
          return;
        }

        const { error } = await supabase.from('line_step_messages').insert({
          store_id: storeId,
          step_id: createdRow.id,
          message_order: Number(formData.message_order || 1),
          delay_amount: Number(formData.delay_amount || 0),
          delay_unit: formData.delay_unit || 'days',
          title: formData.message_title || null,
          body: formData.message_body,
          message_type: 'text',
          is_active: true,
        });

        if (error) {
          throw new Error(error.message);
        }
      }}
    />
  );
}
