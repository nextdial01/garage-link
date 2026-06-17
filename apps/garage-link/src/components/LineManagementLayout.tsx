'use client';

import type { ReactNode } from 'react';

type CategoryItem = {
  label: string;
  count?: number;
};

type LineManagementLayoutProps = {
  title: string;
  description: string;
  helpText?: string;
  categories: CategoryItem[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  toolbar: ReactNode;
  children: ReactNode;
};

export default function LineManagementLayout({
  title,
  description,
  helpText,
  categories,
  selectedCategory,
  onSelectCategory,
  toolbar,
  children,
}: LineManagementLayoutProps) {
  return (
    <div className="-m-4 bg-[#F3FBF6] p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
            {helpText && <p className="mt-2 text-xs font-bold text-green-700">{helpText}</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <button
              type="button"
              className="w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
            >
              フォルダ追加
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
            >
              並べ替え
            </button>
          </div>

          <nav className="space-y-1 p-3">
            {categories.map((category) => {
              const active = category.label === selectedCategory;

              return (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => onSelectCategory(category.label)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    active ? 'bg-green-50 font-bold text-green-700 ring-1 ring-green-100' : 'font-semibold text-slate-600 hover:bg-green-50/60 hover:text-green-700'
                  }`}
                >
                  <span className="min-w-0 truncate">{category.label}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                      {category.count ?? 0}
                    </span>
                    <span className="text-slate-400">...</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            {toolbar}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
