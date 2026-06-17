'use client';

import Link from 'next/link';
import AppShell from '@/components/AppShell';

type FieldType = 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea';

type Field = {
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  wide?: boolean;
  amount?: boolean;
};

type FormSection = {
  title: string;
  description: string;
  fields: Field[];
  note?: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const sections: FormSection[] = [
  {
    title: '請求基本情報',
    description: '請求番号、発行日、支払期限、請求ステータスを設定します。',
    fields: [
      { label: '請求番号', type: 'text', placeholder: '例：INV-2026-000001' },
      {
        label: '関連見積書',
        type: 'select',
        options: ['Q-2026-000001 / CB400SF見積', 'Q-2026-000002 / XSR900見積', 'Q-2026-000003 / ハイエース見積', '未選択'],
      },
      {
        label: '関連商談',
        type: 'select',
        options: ['CB400SF購入相談', 'XSR900見積依頼', 'ハイエース商談', '未選択'],
      },
      {
        label: '請求ステータス',
        type: 'select',
        options: ['下書き', '送付済み', '入金待ち', '一部入金', '入金済み', '期限超過', 'キャンセル'],
      },
      { label: '発行日', type: 'date' },
      { label: '支払期限', type: 'date' },
      { label: '担当者', type: 'text', placeholder: '例：山田' },
    ],
  },
  {
    title: '顧客情報',
    description: '請求書に記載する顧客情報を設定します。',
    note: '今は仮入力でOKです。後で顧客データから自動反映します。',
    fields: [
      { label: '顧客選択', type: 'select', options: ['山田 太郎', '佐藤 花子', '株式会社サンプル', '未選択'] },
      { label: '顧客名', type: 'text' },
      { label: '電話番号', type: 'tel' },
      { label: 'メールアドレス', type: 'email' },
      { label: '郵便番号', type: 'text' },
      { label: '住所', type: 'text', wide: true },
      { label: '敬称', type: 'select', options: ['様', '御中', 'なし'] },
    ],
  },
  {
    title: '関連見積・商談情報',
    description: '請求書に紐づく見積書・商談・車両情報を確認します。',
    note: '今は仮入力でOKです。後で見積書・車両データから自動反映します。',
    fields: [
      { label: '見積番号', type: 'text' },
      { label: '商談番号', type: 'text' },
      { label: '車両選択', type: 'select', options: ['Honda CB400SF', 'Yamaha XSR900', 'Toyota ハイエース', '未選択'] },
      { label: 'メーカー', type: 'text' },
      { label: '車種名', type: 'text' },
      { label: '年式', type: 'number' },
      { label: '車台番号', type: 'text' },
      { label: '登録番号', type: 'text' },
      { label: '支払総額', type: 'number', amount: true },
    ],
  },
  {
    title: '請求明細',
    description: '車両本体、諸費用、整備費用、保険料、税金、値引きなどを入力します。',
    fields: [
      { label: '車両本体価格', type: 'number', amount: true },
      { label: '登録代行費用', type: 'number', amount: true },
      { label: '納車整備費用', type: 'number', amount: true },
      { label: '車検・点検費用', type: 'number', amount: true },
      { label: '自賠責保険', type: 'number', amount: true },
      { label: '重量税', type: 'number', amount: true },
      { label: '印紙代', type: 'number', amount: true },
      { label: 'ナンバー代', type: 'number', amount: true },
      { label: 'リサイクル預託金', type: 'number', amount: true },
      { label: '付属品', type: 'number', amount: true },
      { label: 'カスタム費用', type: 'number', amount: true },
      { label: 'その他費用', type: 'number', amount: true },
      { label: '値引き', type: 'number', amount: true },
      { label: '下取り金額', type: 'number', amount: true },
    ],
  },
  {
    title: '支払情報',
    description: '請求先への支払方法・振込先・決済方法を設定します。',
    fields: [
      {
        label: '支払方法',
        type: 'select',
        options: ['現金', '銀行振込', 'クレジットカード', 'オートローン', 'Stripe決済', '未定'],
      },
      { label: '振込先銀行名', type: 'text', placeholder: '例：三井住友銀行' },
      { label: '支店名', type: 'text', placeholder: '例：大阪支店' },
      { label: '口座種別', type: 'select', options: ['普通', '当座'] },
      { label: '口座番号', type: 'text', placeholder: '例：1234567' },
      { label: '口座名義', type: 'text', placeholder: '例：ガレージリンク' },
      { label: 'Stripe決済URL', type: 'text', placeholder: '後で自動生成', wide: true },
      { label: 'ローン会社', type: 'text', placeholder: '例：オリコ / ジャックス' },
      {
        label: 'ローン承認状況',
        type: 'select',
        options: ['未申請', '審査中', '承認済み', '否決', '不要'],
      },
    ],
  },
  {
    title: '入金管理',
    description: '入金予定、入金日、入金金額を管理します。',
    fields: [
      { label: '請求金額', type: 'number', amount: true },
      { label: '入金済金額', type: 'number', amount: true },
      { label: '未入金額', type: 'number', amount: true },
      { label: '入金予定日', type: 'date' },
      { label: '入金日', type: 'date' },
      { label: '入金確認者', type: 'text', placeholder: '例：山田' },
      {
        label: '入金メモ',
        type: 'textarea',
        placeholder: '例：頭金のみ入金済み。残金は納車前予定。',
        wide: true,
      },
    ],
  },
  {
    title: '備考・社内メモ',
    description: '顧客向けの備考と、社内用メモを登録します。',
    fields: [
      {
        label: '顧客向け備考',
        type: 'textarea',
        placeholder: '例：お支払いは支払期限までにお願いいたします。',
        wide: true,
      },
      {
        label: '社内メモ',
        type: 'textarea',
        placeholder: '例：ローン承認後に請求書送付予定。',
        wide: true,
      },
    ],
  },
];

const summaryItems = [
  { label: '小計', value: '1,650,000円' },
  { label: '消費税', value: '165,000円' },
  { label: '値引き', value: '-50,000円' },
  { label: '下取り', value: '-200,000円' },
  { label: '請求合計', value: '1,565,000円', total: true },
  { label: '入金済', value: '300,000円' },
  { label: '未入金', value: '1,265,000円', due: true },
];

function fieldId(sectionTitle: string, label: string) {
  return `${sectionTitle}-${label}`.replace(/[・\s]/g, '-');
}

function FieldControl({ field, id }: { field: Field; id: string }) {
  if (field.type === 'select') {
    return (
      <select id={id} className={inputClass} defaultValue="">
        <option value="" disabled>
          選択してください
        </option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        id={id}
        rows={5}
        placeholder={field.placeholder}
        className={inputClass}
      />
    );
  }

  return (
    <input
      id={id}
      type={field.type}
      placeholder={field.placeholder}
      className={`${inputClass} ${field.amount ? 'text-right' : ''}`}
    />
  );
}

function InvoiceSection({ section }: { section: FormSection }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">{section.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {section.description}
        </p>
      </div>

      <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
        {section.fields.map((field) => {
          const id = fieldId(section.title, field.label);

          return (
            <div
              key={id}
              className={field.wide ? 'md:col-span-2 xl:col-span-3' : ''}
            >
              <label
                htmlFor={id}
                className="mb-2 block text-sm font-bold text-slate-700"
              >
                {field.label}
              </label>
              <FieldControl field={field} id={id} />
            </div>
          );
        })}
      </div>

      {section.note && (
        <p className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500 sm:px-6">
          ※ {section.note}
        </p>
      )}
    </section>
  );
}

function SummarySection() {
  return (
    <section className="rounded-2xl border border-blue-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">金額サマリー</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          請求金額の合計と入金状況を確認します。
        </p>
      </div>

      <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1fr_420px]">
        <div className="rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">
          今は自動計算しなくてOKです。仮の金額表示でOKです。後でJavaScriptで自動計算を入れます。
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
          <div className="space-y-3">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className={`flex items-center justify-between gap-4 ${
                  item.total ? 'border-t border-blue-200 pt-4' : ''
                }`}
              >
                <span
                  className={`text-sm ${
                    item.total || item.due
                      ? 'font-bold text-slate-950'
                      : 'font-semibold text-slate-600'
                  }`}
                >
                  {item.label}
                </span>
                <span
                  className={`text-right ${
                    item.total
                      ? 'text-2xl font-bold text-blue-700'
                      : item.due
                        ? 'text-xl font-bold text-red-600'
                        : 'text-sm font-bold text-slate-950'
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function NewInvoicePage() {
  return (
    <AppShell
      activeLabel="請求書"
      title="請求書作成"
      description="見積書・顧客・車両情報をもとに請求書を作成します"
      actionButton={
        <Link
          href="/invoices"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          一覧に戻る
        </Link>
      }
    >
      <form className="mx-auto max-w-7xl space-y-8">
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          通常は商談詳細から作成してください。
        </p>

        {sections.map((section) => (
          <InvoiceSection key={section.title} section={section} />
        ))}

        <SummarySection />

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            href="/invoices"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            キャンセル
          </Link>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
          >
            下書き保存
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            請求書を作成する
          </button>
        </div>

        <p className="text-xs text-slate-500">
          ※ 現在は見た目だけのフォームです。次の工程でSupabase保存・PDF出力・Stripe決済連携に対応します。
        </p>
      </form>
    </AppShell>
  );
}
