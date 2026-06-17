import type { ReactNode } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { StatusBadge as CommonStatusBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/Card';

export type StatItem = {
  label: string;
  value: string;
};

export type TableColumn = {
  key: string;
  label: string;
};

export type TableRow = Record<string, string>;

type LineModuleShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  actionButton?: ReactNode;
};

type StatCardsProps = {
  stats: StatItem[];
};

type DataTableProps = {
  title: string;
  description?: string;
  columns: TableColumn[];
  rows: TableRow[];
};

type ModuleListPageProps = {
  title: string;
  description: string;
  stats: StatItem[];
  actionLabel?: string;
  tableTitle: string;
  tableDescription?: string;
  columns: TableColumn[];
  rows: TableRow[];
};

type StatusBadgeProps = {
  value: string;
};

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:ring-4 focus:ring-green-100';

export function LineModuleShell({
  title,
  description,
  children,
  actionButton,
}: LineModuleShellProps) {
  return (
    <AppShell
      activeLabel="LINE配信"
      title={title}
      description={description}
      actionButton={
        actionButton ?? (
          <Link
            href="/line"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
          >
            LINE管理へ戻る
          </Link>
        )
      }
    >
      {children}
    </AppShell>
  );
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {stats.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </div>
  );
}

export function Notice() {
  return (
    <p className="mt-4 text-xs text-slate-500">
      ※ 現在は仮データです。次の工程でSupabase・LINE APIと接続します。
    </p>
  );
}

export function StatusBadge({ value }: StatusBadgeProps) {
  return <CommonStatusBadge value={value} />;
}

export function DataTable({
  title,
  description,
  columns,
  rows,
}: DataTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        {description && (
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-4">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="hover:bg-green-50/60">
                {columns.map((column) => {
                  const value = row[column.key] ?? '';
                  const isStatus =
                    column.label.includes('状態') ||
                    column.label.includes('許可') ||
                    column.label.includes('ステータス') ||
                    column.label.includes('公開') ||
                    column.label.includes('表示');

                  return (
                    <td key={column.key} className="px-5 py-4">
                      {isStatus ? (
                        <StatusBadge value={value} />
                      ) : column.key === 'action' ? (
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
                        >
                          {value}
                        </button>
                      ) : (
                        <span className="font-medium text-slate-700">
                          {value}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ModuleListPage({
  title,
  description,
  stats,
  actionLabel,
  tableTitle,
  tableDescription,
  columns,
  rows,
}: ModuleListPageProps) {
  return (
    <LineModuleShell
      title={title}
      description={description}
      actionButton={
        <div className="flex items-center gap-3">
          <Link
            href="/line"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
          >
            LINE管理へ戻る
          </Link>
          {actionLabel && (
            <button
              type="button"
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
            >
              {actionLabel}
            </button>
          )}
        </div>
      }
    >
      <StatCards stats={stats} />
      <DataTable
        title={tableTitle}
        description={tableDescription}
        columns={columns}
        rows={rows}
      />
      <Notice />
    </LineModuleShell>
  );
}
