type LineStatusBadgeProps = {
  value: string | null | undefined;
};

export default function LineStatusBadge({ value }: LineStatusBadgeProps) {
  const label = value && value.trim() !== '' ? value : '-';
  const className = label === 'friend' || label === 'sent' || label === 'connected'
    ? 'bg-green-50 text-green-700 ring-green-600/20'
    : label === 'blocked' || label === 'failed' || label === 'error'
      ? 'bg-red-50 text-red-700 ring-red-600/20'
      : 'bg-slate-50 text-slate-700 ring-slate-600/20';

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${className}`}>
      {label}
    </span>
  );
}
