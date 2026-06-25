import LineFeatureMovedNotice from '@/components/LineFeatureMovedNotice';

// /line-package/* 配下のLINE運用画面は L-LINK へ移行済み。
// 子ページは描画せず、移行案内のみを表示します。
// （ページ実装はテスト・将来移行のため残置）
export default function LinePackageSectionLayout() {
  return <LineFeatureMovedNotice activeLabel="LINE連携" />;
}
