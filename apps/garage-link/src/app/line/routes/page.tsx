'use client';

import { LineCrudPage, type LineCrudColumn, type LineCrudField } from '../_components/LineCrudPage';

const fields: LineCrudField[] = [
  { name: 'name', label: '経路名', required: true, placeholder: '例：店頭カウンターQR' },
  { name: 'route_code', label: 'route_code', required: true, placeholder: '例：store-front-qr' },
  {
    name: 'route_type',
    label: '経路種別',
    type: 'select',
    defaultValue: 'qr',
    options: [
      { label: '店頭QR', value: 'store_qr' },
      { label: 'Instagram', value: 'instagram' },
      { label: 'ホームページ', value: 'website' },
      { label: 'Googleビジネスプロフィール', value: 'google_business_profile' },
      { label: 'カーセンサー', value: 'carsensor' },
      { label: 'グー', value: 'goo' },
      { label: '紹介', value: 'referral' },
      { label: 'その他', value: 'other' },
      { label: 'QR', value: 'qr' },
    ],
  },
  { name: 'landing_url', label: 'landing_url', placeholder: '例：https://example.com/line/store-front-qr' },
  { name: 'qr_image_path', label: 'QR画像パス', placeholder: '例：line-routes/store-front-qr.png' },
  { name: 'linked_tags', label: '付与タグ', type: 'tags', placeholder: '例：店頭QR, 購入検討中' },
  { name: 'linked_step_id', label: '紐付けシナリオID', placeholder: 'シナリオIDを入力' },
  { name: 'friend_count', label: '友だち数', type: 'number', defaultValue: '0' },
  { name: 'is_active', label: '有効/無効', type: 'boolean', defaultValue: 'true' },
  { name: 'description', label: '説明', type: 'textarea' },
];

const columns: LineCrudColumn[] = [
  { key: 'name', label: '流入経路名' },
  { key: 'route_code', label: 'コード' },
  { key: 'route_type', label: '種別' },
  { key: 'friend_count', label: '登録数', type: 'number' },
  { key: 'linked_tags', label: '付与タグ', type: 'tags' },
  { key: 'is_active', label: '状態', type: 'boolean' },
];

export default function LineRoutesPage() {
  return (
    <LineCrudPage
      title="流入経路"
      description="LINE登録や問い合わせの入口ごとの成果を管理します。"
      tableName="line_routes"
      formTitle="新規流入経路作成"
      tableTitle="流入経路一覧"
      emptyMessage="流入経路はまだありません"
      fields={fields}
      columns={columns}
      searchKeys={['name', 'route_code', 'route_type', 'description']}
      statsBuilder={(rows) => [
        { label: '流入経路数', value: String(rows.length) },
        { label: '有効', value: String(rows.filter((row) => row.is_active === true).length) },
        { label: '無効', value: String(rows.filter((row) => row.is_active === false).length) },
        {
          label: '登録数合計',
          value: String(rows.reduce((total, row) => total + (typeof row.friend_count === 'number' ? row.friend_count : 0), 0)),
        },
      ]}
      helperText="QR生成は後工程で対応します。まずは経路コード、URL、付与タグを管理します。"
      categories={['未分類', '店頭QR', 'Instagram', 'Google', 'チラシ', 'Webサイト', '車検予約', '査定依頼', '購入相談']}
      detailBasePath="/line/routes"
      primaryActionLabel="新規作成"
      secondaryActionLabel="QR作成"
      sortLabel="検索"
    />
  );
}
