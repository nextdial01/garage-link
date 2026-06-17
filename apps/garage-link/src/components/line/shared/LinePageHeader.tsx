import type { ReactNode } from 'react';

type LinePageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  helpText?: string;
};

export default function LinePageHeader({
  title,
  description,
  actions,
  helpText,
}: LinePageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        {helpText && <p className="mt-2 text-xs font-bold text-green-700">{helpText}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
