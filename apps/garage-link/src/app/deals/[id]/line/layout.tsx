import LineFeatureMovedNotice from '@/components/LineFeatureMovedNotice';

// 商談からのLINE直接送信導線（/deals/[id]/line/new）は廃止。
// 子ページは描画せず、移行案内のみを表示します。
// 通常導線は商談詳細から /settings/l-link へ誘導します。
export default function DealLineSectionLayout() {
  return <LineFeatureMovedNotice activeLabel="商談管理" />;
}
