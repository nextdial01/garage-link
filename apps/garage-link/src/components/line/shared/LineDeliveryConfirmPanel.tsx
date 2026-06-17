'use client';

type LineDeliveryConfirmPanelProps = {
  canExecuteDelivery: boolean;
  isConfirming: boolean;
  isSending: boolean;
  isConfirmed: boolean;
  onConfirm: () => void;
  onSend: () => void;
};

export default function LineDeliveryConfirmPanel({
  canExecuteDelivery,
  isConfirming,
  isSending,
  isConfirmed,
  onConfirm,
  onSend,
}: LineDeliveryConfirmPanelProps) {
  if (!canExecuteDelivery) {
    return (
      <span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
        本配信不可
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={isConfirming}
        onClick={onConfirm}
        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        {isConfirming ? '確認中...' : '配信前確認'}
      </button>
      <button
        type="button"
        disabled={isSending || !isConfirmed}
        onClick={onSend}
        className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        title={!isConfirmed ? '本配信前に配信前確認が必要です。' : undefined}
      >
        {isSending ? '送信中...' : '本配信'}
      </button>
    </>
  );
}
