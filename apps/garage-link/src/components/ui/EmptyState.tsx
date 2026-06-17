import type { ReactNode } from 'react';

export default function EmptyState({
  title = 'データがありません',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-bold text-slate-600">{title}</p>
      {description && <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
