'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: 'メニュー名', required: true, placeholder: '例：標準メニュー' },
  {
    name: 'status',
    label: 'ステータス',
    type: 'select',
    defaultValue: 'draft',
    options: [
      { label: '下書き', value: 'draft' },
      { label: '表示中', value: 'active' },
      { label: '停止中', value: 'paused' },
      { label: 'アーカイブ', value: 'archived' },
    ],
  },
  { name: 'chat_bar_text', label: 'チャットバー文言', defaultValue: 'メニュー' },
  {
    name: 'layout_type',
    label: 'レイアウト種別',
    type: 'select',
    defaultValue: 'large',
    options: [
      { label: '大', value: 'large' },
      { label: '小', value: 'small' },
      { label: '2分割', value: 'two_columns' },
      { label: '6分割', value: 'six_areas' },
    ],
  },
  { name: 'selected', label: 'デフォルト表示', type: 'boolean', defaultValue: 'false' },
  { name: 'image_path', label: '画像パス', placeholder: '例：rich-menus/default.png' },
  { name: 'line_rich_menu_id', label: 'LINE Rich Menu ID', placeholder: 'LINE API連携後に保存します' },
  {
    name: 'areas',
    label: 'エリア設定JSON',
    type: 'json',
    placeholder: '[{"label":"在庫を見る","action":"uri","url":"https://example.com"}]',
  },
  { name: 'internal_memo', label: '社内メモ', type: 'textarea' },
];

const columns: LineCrudColumn[] = [
  { key: 'name', label: 'メニュー名' },
  { key: 'status', label: '表示状態', type: 'status' },
  { key: 'chat_bar_text', label: 'バー文言' },
  { key: 'layout_type', label: 'レイアウト' },
  { key: 'selected', label: 'デフォルト', type: 'boolean' },
  { key: 'updated_at', label: '最終更新', type: 'datetime' },
];

export default function LineRichMenusPage() {
  return (
    <LineCrudPage
      title="リッチメニュー"
      description="在庫検索、査定依頼、車検予約などのLINE入口を管理します。"
      tableName="line_rich_menus"
      formTitle="新規リッチメニュー作成"
      tableTitle="リッチメニュー一覧"
      emptyMessage="リッチメニューはまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['name', 'status', 'chat_bar_text', 'layout_type']}
      statsBuilder={(rows) => [
        { label: 'メニュー数', value: String(rows.length) },
        { label: '表示中', value: String(rows.filter((row) => row.status === 'active').length) },
        { label: '下書き', value: String(rows.filter((row) => row.status === 'draft').length) },
        { label: 'デフォルト', value: String(rows.filter((row) => row.selected === true).length) },
      ]}
      helperText="LINE APIへの反映はまだ行いません。画像パスとエリア設定を管理用に保存します。"
      categories={['未分類', '通常メニュー', '査定導線', '購入相談', '車検修理', '既存顧客向け', 'キャンペーン']}
      detailBasePath="/line/rich-menus"
      primaryActionLabel="新規作成"
      secondaryActionLabel="画像アップロード"
      sortLabel="検索"
      preview={(formData) => (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">プレビュー枠</p>
          <div className="mt-3 aspect-[1.55/1] max-w-md rounded-xl border border-slate-300 bg-white p-4">
            <div className="grid h-full grid-cols-3 gap-2">
              {['在庫を見る', '買取査定', '車検予約', '購入相談', '来店予約', 'お問い合わせ'].map((label) => (
                <div key={label} className="flex items-center justify-center rounded-lg border border-green-100 bg-green-50 text-xs font-bold text-green-700">
                  {label}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-700">{formData.chat_bar_text || 'メニュー'}</p>
        </div>
      )}
    />
  );
}
