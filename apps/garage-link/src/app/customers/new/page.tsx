'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'number'
  | 'select'
  | 'textarea';

type Field = {
  label: string;
  type: FieldType;
  name?: keyof CustomerFormState;
  placeholder?: string;
  options?: string[];
  note?: string;
  wide?: boolean;
};

type FieldGroup = {
  title: string;
  fields: Field[];
};

type FormSection = {
  title: string;
  description: string;
  fields: Field[];
};

type CustomerFormState = {
  customer_type: string;
  name: string;
  kana: string;
  phone: string;
  mobile_phone: string;
  email: string;
  postal_code: string;
  address: string;
  gender: string;
  birth_date: string;
  line_user_id: string;
  line_display_name: string;
  line_friend_status: string;
  delivery_permission: string;
  desired_maker: string;
  desired_model: string;
  desired_displacement: string;
  budget_min: string;
  budget_max: string;
  desired_purchase_timing: string;
  trade_in_status: string;
  customer_status: string;
  assigned_user_name: string;
  next_action_date: string;
  memo: string;
};

type StoreMemberRow = {
  store_id: string;
};

type CustomerInsert = {
  store_id: string;
  customer_type: string;
  name: string;
  kana: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  gender: string | null;
  birth_date: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  line_friend_status: string;
  delivery_permission: string;
  desired_maker: string | null;
  desired_model: string | null;
  desired_displacement: string | null;
  budget_min: number | null;
  budget_max: number | null;
  desired_purchase_timing: string | null;
  trade_in_status: string | null;
  customer_status: string;
  assigned_user_name: string | null;
  next_action_date: string | null;
  memo: string | null;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const initialFormState: CustomerFormState = {
  customer_type: '個人',
  name: '',
  kana: '',
  phone: '',
  mobile_phone: '',
  email: '',
  postal_code: '',
  address: '',
  gender: '',
  birth_date: '',
  line_user_id: '',
  line_display_name: '',
  line_friend_status: '未連携',
  delivery_permission: '許可',
  desired_maker: '',
  desired_model: '',
  desired_displacement: '',
  budget_min: '',
  budget_max: '',
  desired_purchase_timing: '',
  trade_in_status: '',
  customer_status: '見込み',
  assigned_user_name: '',
  next_action_date: '',
  memo: '',
};

const basicGroups: FieldGroup[] = [
  {
    title: '顧客属性',
    fields: [
      { label: '性別', type: 'select', name: 'gender', options: ['男性', '女性', '回答しない'] },
      {
        label: '顧客グループ',
        type: 'select',
        options: ['未選択', '新規', '見込み', '購入済み', '整備顧客', '法人顧客', 'VIP'],
      },
      { label: '登録番号', type: 'text', placeholder: '例：C-000001' },
    ],
  },
  {
    title: '氏名・管理情報',
    fields: [
      { label: '顧客/会社名カナ', type: 'text', name: 'kana', placeholder: '例：ヤマダタロウ' },
      { label: '顧客/会社名', type: 'text', name: 'name', placeholder: '例：山田 太郎' },
      { label: '窓口/代表者', type: 'text', placeholder: '例：山田 太郎' },
      { label: '年齢', type: 'number' },
      { label: '生年月日', type: 'date', name: 'birth_date' },
    ],
  },
  {
    title: '住所・免許情報',
    fields: [
      { label: '郵便番号', type: 'text', name: 'postal_code', placeholder: '例：550-0001' },
      { label: '住所', type: 'text', name: 'address', placeholder: '例：大阪府大阪市...', wide: true },
      {
        label: '免許証番号',
        type: 'text',
        placeholder: '例：第000000000000号',
        note: '※ 本人確認・古物営業法対応など、必要な場合のみ入力してください。',
      },
    ],
  },
  {
    title: '連絡先',
    fields: [
      { label: 'TEL', type: 'tel', name: 'phone', placeholder: '例：06-0000-0000' },
      { label: '携帯TEL', type: 'tel', name: 'mobile_phone', placeholder: '例：090-0000-0000' },
      { label: 'Eメール', type: 'email', name: 'email' },
      {
        label: 'コメント',
        type: 'textarea',
        name: 'memo',
        placeholder: '例：連絡時の注意点、希望条件、対応履歴など',
        wide: true,
      },
    ],
  },
  {
    title: '勤務先情報',
    fields: [
      { label: '勤務先名カナ', type: 'text' },
      { label: '勤務先名', type: 'text' },
      { label: '勤務先TEL', type: 'tel' },
      { label: '勤務先郵便番号', type: 'text' },
      { label: '勤務先住所', type: 'text', wide: true },
    ],
  },
];

const formSections: FormSection[] = [
  {
    title: 'LINE連携情報',
    description: 'LINE友だち状態、配信可否、顧客タグを登録します。',
    fields: [
      { label: 'LINE表示名', type: 'text', name: 'line_display_name' },
      { label: 'LINEユーザーID', type: 'text', name: 'line_user_id' },
      { label: 'LINE友だち状態', type: 'select', name: 'line_friend_status', options: ['未連携', '友だち', 'ブロック'] },
      { label: '配信許可', type: 'select', name: 'delivery_permission', options: ['許可', '不許可'] },
      {
        label: '顧客タグ',
        type: 'text',
        placeholder: '例：250cc希望, 車検案内対象, 購入検討中',
        wide: true,
      },
    ],
  },
  {
    title: '希望条件',
    description: '購入検討中の車両条件、予算、下取り有無を登録します。',
    fields: [
      { label: '希望メーカー', type: 'text', name: 'desired_maker' },
      { label: '希望車種', type: 'text', name: 'desired_model' },
      { label: '希望排気量', type: 'text', name: 'desired_displacement' },
      { label: '予算下限', type: 'number', name: 'budget_min' },
      { label: '予算上限', type: 'number', name: 'budget_max' },
      {
        label: '購入希望時期',
        type: 'select',
        name: 'desired_purchase_timing',
        options: ['すぐ', '1ヶ月以内', '3ヶ月以内', '半年以内', '未定'],
      },
      { label: '下取り有無', type: 'select', name: 'trade_in_status', options: ['あり', 'なし', '未定'] },
    ],
  },
  {
    title: '商談・対応情報',
    description: '商談状況、担当者、次回対応日、対応メモを登録します。',
    fields: [
      {
        label: '顧客ステータス',
        type: 'select',
        name: 'customer_status',
        options: ['見込み', '商談中', '購入済み', '失注', '対応不要'],
      },
      { label: '担当者', type: 'text', name: 'assigned_user_name' },
      { label: '次回対応日', type: 'date', name: 'next_action_date' },
      { label: '対応メモ', type: 'textarea', name: 'memo', wide: true },
    ],
  },
  {
    title: '購入後フォロー情報',
    description: '納車後の車検・点検案内やフォロー通知を登録します。',
    fields: [
      { label: '購入車両', type: 'text' },
      { label: '納車日', type: 'date' },
      { label: '車検満了日', type: 'date' },
      { label: '点検案内対象', type: 'select', options: ['対象', '対象外'] },
      { label: 'フォロー通知', type: 'select', options: ['有効', '無効'] },
    ],
  },
];

const weekdays = ['月', '火', '水', '木', '金', '土', '日'];

function fieldId(scope: string, label: string) {
  return `${scope}-${label}`.replace(/[・\s/]/g, '-');
}

function toNullableText(value: string) {
  return value.trim() === '' ? null : value.trim();
}

function toNullableNumber(value: string) {
  if (value.trim() === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function FieldControl({
  field,
  id,
  value,
  onChange,
}: {
  field: Field;
  id: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const controlledProps =
    onChange !== undefined
      ? {
          value: value ?? '',
          onChange: (
            event: ChangeEvent<
              HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
            >
          ) => onChange(event.target.value),
        }
      : {};

  if (field.type === 'select') {
    return (
      <select
        id={id}
        className={inputClass}
        defaultValue={onChange === undefined ? '' : undefined}
        {...controlledProps}
      >
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
        {...controlledProps}
      />
    );
  }

  return (
    <input
      id={id}
      type={field.type}
      placeholder={field.placeholder}
      className={inputClass}
      {...controlledProps}
    />
  );
}

function FormField({
  field,
  scope,
  value,
  onChange,
  className = '',
}: {
  field: Field;
  scope: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  const id = fieldId(scope, field.label);

  return (
    <div className={`${field.wide ? 'md:col-span-2 xl:col-span-3' : ''} ${className}`}>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-700">
        {field.label}
      </label>
      <FieldControl field={field} id={id} value={value} onChange={onChange} />
      {field.note && (
        <p className="mt-2 text-xs leading-5 text-slate-500">{field.note}</p>
      )}
    </div>
  );
}

function BasicInfoSection({
  formState,
  updateField,
}: {
  formState: CustomerFormState;
  updateField: (name: keyof CustomerFormState, value: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">基本情報</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          顧客名、住所、連絡先、勤務先などの基本情報を登録します。
        </p>
      </div>

      <div className="space-y-8 px-5 py-6 sm:px-6">
        <div>
          <h4 className="mb-4 text-sm font-bold text-slate-950">顧客属性</h4>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <p className="mb-2 block text-sm font-bold text-slate-700">属性</p>
              <div className="flex min-h-11 flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2">
                {['個人', '法人'].map((option) => (
                  <label
                    key={option}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"
                  >
                    <input
                      name="customer-type"
                      type="radio"
                      value={option}
                      checked={formState.customer_type === option}
                      onChange={(event) =>
                        updateField('customer_type', event.target.value)
                      }
                      className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </div>

            {basicGroups[0].fields.map((field) => (
              <FormField
                key={field.label}
                field={field}
                scope="顧客属性"
                value={field.name ? formState[field.name] : undefined}
                onChange={
                  field.name
                    ? (value) => updateField(field.name as keyof CustomerFormState, value)
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {basicGroups.slice(1, 4).map((group) => (
          <div key={group.title}>
            <h4 className="mb-4 text-sm font-bold text-slate-950">
              {group.title}
            </h4>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {group.fields.map((field) => (
                <FormField
                  key={field.label}
                  field={field}
                  scope={group.title}
                  value={field.name ? formState[field.name] : undefined}
                  onChange={
                    field.name
                      ? (value) => updateField(field.name as keyof CustomerFormState, value)
                      : undefined
                  }
                />
              ))}

              {group.title === '氏名・管理情報' && (
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  生年月日不明：不明
                </label>
              )}

              {group.title === '連絡先' && (
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  メール送信可
                </label>
              )}
            </div>
          </div>
        ))}

        <div>
          <h4 className="mb-4 text-sm font-bold text-slate-950">
            希望連絡設定
          </h4>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label
                htmlFor="preferred-contact-time"
                className="mb-2 block text-sm font-bold text-slate-700"
              >
                希望連絡時間帯
              </label>
              <select id="preferred-contact-time" className={inputClass} defaultValue="">
                <option value="" disabled>
                  選択してください
                </option>
                <option>午前</option>
                <option>午後</option>
                <option>夕方以降</option>
                <option>いつでも可</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <p className="mb-2 block text-sm font-bold text-slate-700">
                希望連絡曜日
              </p>
              <div className="flex flex-wrap gap-2">
                {weekdays.map((day) => (
                  <label key={day} className="cursor-pointer">
                    <input type="checkbox" value={day} className="peer sr-only" />
                    <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white">
                      {day}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-bold text-slate-950">
            勤務先情報
          </h4>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {basicGroups[4].fields.map((field) => (
              <FormField key={field.label} field={field} scope="勤務先情報" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StandardSection({
  section,
  formState,
  updateField,
}: {
  section: FormSection;
  formState: CustomerFormState;
  updateField: (name: keyof CustomerFormState, value: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">{section.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {section.description}
        </p>
      </div>

      <div className="grid gap-5 px-5 py-6 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
        {section.fields.map((field) => (
          <FormField
            key={field.label}
            field={field}
            scope={section.title}
            value={field.name ? formState[field.name] : undefined}
            onChange={
              field.name
                ? (value) => updateField(field.name as keyof CustomerFormState, value)
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

export default function NewCustomerPage() {
  const router = useRouter();
  const [formState, setFormState] = useState<CustomerFormState>(initialFormState);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function updateField(name: keyof CustomerFormState, value: string) {
    setFormState((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function getCurrentStoreId() {
    const supabase = createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user?.id) {
      throw new Error(userError?.message ?? 'ログイン情報を取得できませんでした。');
    }

    const { data: member, error: memberError } = await supabase
      .from<StoreMemberRow>('store_members')
      .select('store_id')
      .eq('user_id', userData.user.id)
      .single();

    if (memberError || !member?.store_id) {
      throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
    }

    return member.store_id;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);

    try {
      const supabase = createClient();
      const storeId = await getCurrentStoreId();
      const payload: CustomerInsert = {
        store_id: storeId,
        customer_type: formState.customer_type || '個人',
        name: formState.name.trim(),
        kana: toNullableText(formState.kana),
        phone: toNullableText(formState.phone),
        mobile_phone: toNullableText(formState.mobile_phone),
        email: toNullableText(formState.email),
        postal_code: toNullableText(formState.postal_code),
        address: toNullableText(formState.address),
        gender: toNullableText(formState.gender),
        birth_date: toNullableText(formState.birth_date),
        line_user_id: toNullableText(formState.line_user_id),
        line_display_name: toNullableText(formState.line_display_name),
        line_friend_status: formState.line_friend_status || '未連携',
        delivery_permission: formState.delivery_permission || '許可',
        desired_maker: toNullableText(formState.desired_maker),
        desired_model: toNullableText(formState.desired_model),
        desired_displacement: toNullableText(formState.desired_displacement),
        budget_min: toNullableNumber(formState.budget_min),
        budget_max: toNullableNumber(formState.budget_max),
        desired_purchase_timing: toNullableText(formState.desired_purchase_timing),
        trade_in_status: toNullableText(formState.trade_in_status),
        customer_status: formState.customer_status || '見込み',
        assigned_user_name: toNullableText(formState.assigned_user_name),
        next_action_date: toNullableText(formState.next_action_date),
        memo: toNullableText(formState.memo),
      };

      if (!payload.name) {
        throw new Error('顧客/会社名を入力してください。');
      }

      const { error } = await supabase.from<CustomerInsert>('customers').insert(payload);

      if (error) {
        throw new Error(error.message);
      }

      router.push('/customers');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '顧客登録に失敗しました。');
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      activeLabel="顧客管理"
      title="顧客登録"
      description="顧客情報・LINE連携情報・希望条件・対応履歴を登録します"
      actionButton={
        <Link
          href="/customers"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          一覧に戻る
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-7xl space-y-8">
        {errorMessage && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        <BasicInfoSection formState={formState} updateField={updateField} />

        {formSections.map((section) => (
          <StandardSection
            key={section.title}
            section={section}
            formState={formState}
            updateField={updateField}
          />
        ))}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            href="/customers"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? '登録中...' : '顧客を登録する'}
          </button>
        </div>

        <p className="text-xs text-slate-500">
          ※ 現在は見た目だけのフォームです。次の工程でSupabaseに保存できるようにします。
        </p>
      </form>
    </AppShell>
  );
}
