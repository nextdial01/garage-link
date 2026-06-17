'use client';

import type { ReactNode } from 'react';

export type LineEditorStep = {
  id: string;
  label: string;
  description?: string;
};

type LineStepEditorLayoutProps = {
  breadcrumb: string;
  title: string;
  managementName: string;
  folderName: string;
  steps: LineEditorStep[];
  activeStep: string;
  onStepChange: (stepId: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSave: () => void;
  onSaveAndBack: () => void;
  children: ReactNode;
};

export default function LineStepEditorLayout({
  breadcrumb,
  title,
  managementName,
  folderName,
  steps,
  activeStep,
  onStepChange,
  onNext,
  onBack,
  onSave,
  onSaveAndBack,
  children,
}: LineStepEditorLayoutProps) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeStep));
  const activeStepItem = steps[activeIndex] ?? steps[0];
  const stepNumbers = ['①', '②', '③', '④', '⑤', '⑥'];

  return (
    <div className="-m-4 bg-[#F3FBF6] p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{breadcrumb}</p>
        <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">
              STEPに沿って設定を確認し、必要な項目を編集します。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[520px]">
            <label>
              <span className="text-xs font-bold text-slate-500">管理名</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                defaultValue={managementName}
              />
            </label>
            <label>
              <span className="text-xs font-bold text-slate-500">フォルダ</span>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
                defaultValue={folderName}
              >
                <option value={folderName}>{folderName}</option>
                <option value="未分類">未分類</option>
                <option value="車両提案">車両提案</option>
                <option value="フォローアップ">フォローアップ</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative space-y-1">
            <div className="absolute left-5 top-8 h-[calc(100%-64px)] w-px bg-slate-200" />
            {steps.map((step, index) => {
              const active = step.id === activeStep;
              const done = index < activeIndex;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onStepChange(step.id)}
                  className={`relative flex w-full gap-3 rounded-xl px-2 py-3 text-left transition ${
                    active ? 'bg-green-50' : 'hover:bg-green-50/60'
                  }`}
                >
                  <span
                    className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-4 ring-white ${
                      active
                        ? 'bg-green-600 text-white'
                        : done
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 pt-1">
                    <span className={`block text-sm font-bold ${active ? 'text-green-700' : 'text-slate-700'}`}>
                      {step.label}
                    </span>
                    {step.description && (
                      <span className="mt-1 block text-xs leading-5 text-slate-500">{step.description}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-wide text-green-600">STEP {activeIndex + 1}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">
              STEP{stepNumbers[activeIndex] ?? activeIndex + 1} {activeStepItem?.label}
            </h3>
            {activeStepItem?.description && (
              <p className="mt-2 text-sm text-slate-500">{activeStepItem.description}</p>
            )}
          </div>
          <div className="p-5 sm:p-6">{children}</div>
          <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-green-50"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-bold text-green-700 shadow-sm transition hover:bg-green-100"
              >
                次へ
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onSave}
                className="rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
              >
                保存
              </button>
              <button
                type="button"
                onClick={onSaveAndBack}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
              >
                保存して一覧へ戻る
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
