'use client';

type LineTestDeliveryPanelProps = {
  canTestDelivery: boolean;
  isTesting: boolean;
  onTest: () => void;
};

export default function LineTestDeliveryPanel({
  canTestDelivery,
  isTesting,
  onTest,
}: LineTestDeliveryPanelProps) {
  if (!canTestDelivery) return null;

  return (
    <button
      type="button"
      disabled={isTesting}
      onClick={onTest}
      className="rounded-lg border border-green-200 bg-white px-3 py-2 text-xs font-bold text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:bg-slate-100"
    >
      {isTesting ? '送信中...' : 'テスト配信'}
    </button>
  );
}
