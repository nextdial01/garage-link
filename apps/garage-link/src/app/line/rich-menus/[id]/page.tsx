'use client';

import LineRecordDetailPage from '../../_components/LineRecordDetailPage';
import type { LineCrudField } from '../../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'メニュー名', required: true },
  {
    name: 'status',
    label: 'ステータス',
    type: 'select',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '表示中', value: 'active' },
      { label: '停止中', value: 'paused' },
      { label: 'アーカイブ', value: 'archived' },
    ],
  },
  { name: 'chat_bar_text', label: 'チャットバー文言' },
  {
    name: 'layout_type',
    label: 'レイアウト種別',
    type: 'select',
    options: [
      { label: '大', value: 'large' },
      { label: '小', value: 'small' },
      { label: '2分割', value: 'two_columns' },
      { label: '6分割', value: 'six_areas' },
    ],
  },
  { name: 'selected', label: 'デフォルト表示', type: 'boolean' },
  { name: 'image_path', label: '画像パス' },
  { name: 'line_rich_menu_id', label: 'LINE Rich Menu ID' },
  { name: 'areas', label: 'エリア設定JSON', type: 'json' },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

export default function LineRichMenuDetailPage() {
  return (
    <LineRecordDetailPage
      title="リッチメニュー詳細"
      description="リッチメニューの設定とエリア情報を確認・編集します。"
      tableName="line_rich_menus"
      listPath="/line/rich-menus"
      fields={fields}
      nameKey="name"
    />
  );
}
