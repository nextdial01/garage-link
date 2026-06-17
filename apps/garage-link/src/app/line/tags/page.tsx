'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'タグ名', required: true, placeholder: '例：250cc希望' },
  { name: 'color', label: '色', type: 'color', defaultValue: '#2563eb' },
  {
    name: 'tag_type',
    label: '種別',
    type: 'select',
    defaultValue: 'manual',
    options: [
      { label: '手動', value: 'manual' },
      { label: '希望条件', value: 'desired_condition' },
      { label: '商談', value: 'deal' },
      { label: 'フォロー', value: 'follow_up' },
      { label: '自動', value: 'auto' },
    ],
  },
  { name: 'is_active', label: '有効/無効', type: 'boolean', defaultValue: 'true' },
  { name: 'description', label: '説明', type: 'textarea', placeholder: 'タグの用途を入力します。' },
];

const columns: LineCrudColumn[] = [
  { key: 'name', label: '管理名' },
  { key: 'tag_type', label: 'アクション設定' },
  { key: 'is_active', label: '人数制限', type: 'boolean' },
  { key: 'created_at', label: '作成日', type: 'date' },
  { key: 'updated_at', label: '最終編集日', type: 'datetime' },
  { key: 'description', label: '人数' },
];

export default function LineTagsPage() {
  return (
    <LineCrudPage
      title="タグ管理"
      description="希望車種、予算、購入時期などでLINE友だちを分類します。"
      tableName="line_tags"
      formTitle="新規タグ作成"
      tableTitle="タグ一覧"
      emptyMessage="タグはまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['name', 'description', 'tag_type']}
      statsBuilder={(rows) => [
        { label: 'タグ数', value: String(rows.length) },
        { label: '有効', value: String(rows.filter((row) => row.is_active === true).length) },
        { label: '無効', value: String(rows.filter((row) => row.is_active === false).length) },
        { label: '手動タグ', value: String(rows.filter((row) => row.tag_type === 'manual').length) },
      ]}
      helperText="タグはLINE友だちの絞り込み、一斉配信、ステップ配信の条件に使います。"
      categories={['未分類', 'あいさつメッセージ', 'フォーム', 'リッチメニュー', 'シナリオ配信', '車検修理後シナリオ', '買取後シナリオ', '購入後シナリオ', '口コミ誘導', '流入']}
      detailBasePath="/line/tags"
      primaryActionLabel="新規作成"
      showCsvButton
    />
  );
}
