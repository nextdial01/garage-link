'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { VEHICLE_LIMIT_MESSAGE, assertVehicleLimitAvailable } from '@/lib/billing/garageSubscription';
import { createClient } from '@/lib/supabase/client';

type FieldType = 'text' | 'number' | 'date' | 'select' | 'radio' | 'textarea';

type Field = {
  label: string;
  type: FieldType;
  name?: keyof VehicleFormState;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  wide?: boolean;
};

type FormSection = {
  title: string;
  description: string;
  fields: Field[];
};

type VehicleFormState = {
  management_no: string;
  vehicle_type: string;
  maker: string;
  model_name: string;
  grade: string;
  vin: string;
  registration_no: string;
  first_registration_month: string;
  model_year: string;
  displacement_cc: string;
  mileage_km: string;
  color: string;
  inspection_expiry_date: string;
  purchase_price: string;
  base_price: string;
  total_price: string;
  status: string;
  location_name: string;
  description: string;
  internal_memo: string;
};

type StoreMemberRow = {
  store_id: string;
};

type VehicleInsert = {
  store_id: string;
  management_no: string | null;
  vehicle_type: string | null;
  maker: string | null;
  model_name: string | null;
  grade: string | null;
  vin: string | null;
  registration_no: string | null;
  first_registration_month: string | null;
  model_year: number | null;
  displacement_cc: number | null;
  mileage_km: number | null;
  color: string | null;
  inspection_expiry_date: string | null;
  purchase_price: number | null;
  base_price: number | null;
  total_price: number | null;
  status: string;
  location_name: string | null;
  description: string | null;
  internal_memo: string | null;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const initialFormState: VehicleFormState = {
  management_no: '',
  vehicle_type: '',
  maker: '',
  model_name: '',
  grade: '',
  vin: '',
  registration_no: '',
  first_registration_month: '',
  model_year: '',
  displacement_cc: '',
  mileage_km: '',
  color: '',
  inspection_expiry_date: '',
  purchase_price: '',
  base_price: '',
  total_price: '',
  status: '在庫中',
  location_name: '',
  description: '',
  internal_memo: '',
};

const vehicleSections: FormSection[] = [
  {
    title: '車両情報',
    description: '車両台帳の基本情報、仕様、装備内容を登録します。',
    fields: [
      { label: '車台No', type: 'text', name: 'vin', placeholder: '例：NCP160-1234567', required: true },
      { label: '登録No', type: 'text', name: 'registration_no', placeholder: '例：品川 300 あ 12-34' },
      { label: 'メーカー名', type: 'text', name: 'maker', placeholder: '例：トヨタ', required: true },
      { label: '車名', type: 'text', name: 'model_name', placeholder: '例：プロボックス', required: true },
      { label: 'グレード', type: 'text', name: 'grade', placeholder: '例：F' },
      { label: 'グレード補記', type: 'text', placeholder: '例：セーフティエディション' },
      { label: '年式', type: 'number', name: 'model_year', placeholder: '例：2022' },
      { label: '型式', type: 'text', placeholder: '例：5BE-NCP160V' },
      { label: '類別', type: 'text', placeholder: '例：0001' },
      { label: '走行距離', type: 'number', name: 'mileage_km', placeholder: '例：42000' },
      { label: '仕入時走行距離', type: 'number', placeholder: '例：41500' },
      { label: '車検', type: 'date', name: 'inspection_expiry_date' },
      { label: '色', type: 'text', name: 'color', placeholder: '例：ホワイト' },
      { label: '系統色', type: 'select', options: ['白系', '黒系', '銀系', '灰系', '赤系', '青系', '緑系', 'その他'] },
      { label: '車両No', type: 'text', name: 'management_no', placeholder: '例：GL-0001' },
      { label: '修復歴', type: 'select', options: ['設定無し', '有り', '無し'], required: true },
      { label: '定期点検整備', type: 'select', options: ['設定無し', '有り', '無し', '納車時実施'] },
      { label: '車検・点検費用', type: 'number', placeholder: '例：88000' },
      { label: '車両用途', type: 'select', options: ['自家用', '営業用', 'レンタカー', 'その他'] },
      { label: '車種区分', type: 'select', options: ['普通', '小型', '軽自動車', '貨物', '特殊'] },
      { label: 'ミッション', type: 'select', options: ['AT', 'MT', 'CVT', 'その他'] },
      { label: 'エンジン区分', type: 'select', options: ['ガソリン', 'ディーゼル', 'ロータリー', 'ハイブリッド', '電気'] },
      { label: '排気量', type: 'number', name: 'displacement_cc', placeholder: '例：1500' },
      { label: '駆動', type: 'radio', options: ['4WD以外', '4WD'] },
      { label: '国産・輸入車', type: 'radio', options: ['国産', '輸入車'] },
      { label: '車両重量', type: 'number', placeholder: '例：1090' },
      { label: '車両総重量', type: 'number', placeholder: '例：1650' },
      { label: '最大積載量', type: 'number', placeholder: '例：400' },
      { label: '装備', type: 'textarea', name: 'description', placeholder: '例：ナビ、ETC、バックカメラ、ドラレコ', wide: true },
    ],
  },
  {
    title: '仕入価格情報',
    description: '仕入時の原価、リサイクル預託、支払管理を登録します。',
    fields: [
      { label: '税区分', type: 'radio', options: ['税込', '税抜'], required: true },
      { label: 'リ預託状況', type: 'select', options: ['リ済別', 'リ済込', '未預託'] },
      { label: 'リ追加', type: 'number', placeholder: '例：0' },
      { label: 'リ預相当額', type: 'number', placeholder: '例：9800' },
      { label: '仕入価格', type: 'number', name: 'purchase_price', placeholder: '例：1200000', required: true },
      { label: '仕入消費税', type: 'number', placeholder: '例：120000' },
      { label: '特仕原価計', type: 'number', placeholder: '例：0' },
      { label: '付属品原価計', type: 'number', placeholder: '例：30000' },
      { label: '手続代行原価', type: 'number', placeholder: '例：15000' },
      { label: '預り法定原価', type: 'number', placeholder: '例：25000' },
      { label: '経費計', type: 'number', placeholder: '例：50000' },
      { label: '加修費計', type: 'number', placeholder: '例：80000' },
      { label: '仕入合計', type: 'number', placeholder: '例：1329800' },
      { label: '原価合計', type: 'number', placeholder: '例：1504800' },
      { label: '支払管理', type: 'radio', options: ['する', 'しない'] },
    ],
  },
  {
    title: '販売価格情報',
    description: '掲載価格、販売総額、展示場所、販売時コメントを登録します。',
    fields: [
      { label: '税区分', type: 'radio', options: ['税込', '税抜'], required: true },
      { label: 'リ預託状況', type: 'select', options: ['リ済別', 'リ済込', '未預託'] },
      { label: 'リ追加', type: 'number', placeholder: '例：0' },
      { label: 'リ預相当額', type: 'number', placeholder: '例：9800' },
      { label: '車両価格', type: 'number', name: 'base_price', placeholder: '例：1680000', required: true },
      { label: '掲載価格', type: 'number', placeholder: '例：1780000' },
      { label: '販売総額', type: 'number', name: 'total_price', placeholder: '例：1890000' },
      { label: '卸価格', type: 'number', placeholder: '例：1500000' },
      { label: '展示場所', type: 'select', name: 'location_name', options: ['第1展示場', '第2展示場', '整備工場', 'ヤード', '倉庫'] },
      { label: '店舗移動日', type: 'date' },
      { label: 'PRコメント', type: 'textarea', placeholder: '車両の魅力や掲載用コメントを入力', wide: true },
      { label: '特記事項', type: 'textarea', name: 'internal_memo', placeholder: '商談時に共有したい注意事項を入力', wide: true },
    ],
  },
  {
    title: '古物情報',
    description: '古物営業法に関する確認情報を登録します。',
    fields: [
      { label: '古物商特例対象', type: 'radio', options: ['対象', '対象外'], required: true },
      { label: '区分', type: 'select', options: ['個人', '法人', 'オークション', '下取', '買取'] },
      { label: '代価', type: 'number', placeholder: '例：1200000' },
      { label: '確認方法', type: 'select', options: ['運転免許証', 'マイナンバーカード', '在留カード', '登記簿', 'その他'] },
    ],
  },
];

function fieldId(sectionTitle: string, label: string) {
  return `${sectionTitle}-${label}`.replace(/[・\s]/g, '-');
}

function toNullableText(value: string) {
  const trimmed = value.trim();

  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
    return null;
  }

  return trimmed;
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
    if (onChange === undefined) {
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

    return (
      <select id={id} className={inputClass} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
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

  if (field.type === 'radio') {
    return (
      <div className="flex min-h-11 flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2">
        {field.options?.map((option) => (
          <label
            key={option}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"
          >
            <input
              name={id}
              type="radio"
              value={option}
              className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        id={id}
        rows={4}
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

export default function NewVehiclePage() {
  const router = useRouter();
  const [formState, setFormState] = useState<VehicleFormState>(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (saveError && saveErrorRef.current) {
      saveErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [saveError]);

  function updateField(name: keyof VehicleFormState, value: string) {
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
    setSaveError('');

    const missingFields: string[] = [];
    if (!formState.vin.trim()) missingFields.push('車台No');
    if (!formState.maker.trim() || formState.maker.trim() === 'undefined') {
      missingFields.push('メーカー名');
    }
    if (!formState.model_name.trim() || formState.model_name.trim() === 'undefined') {
      missingFields.push('車名');
    }

    if (missingFields.length > 0) {
      setSaveError(`${missingFields.join('・')}を入力してください。`);
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      const storeId = await getCurrentStoreId();
      await assertVehicleLimitAvailable(supabase, storeId);
      const payload: VehicleInsert = {
        store_id: storeId,
        management_no: toNullableText(formState.management_no),
        vehicle_type: toNullableText(formState.vehicle_type),
        maker: toNullableText(formState.maker),
        model_name: toNullableText(formState.model_name),
        grade: toNullableText(formState.grade),
        vin: toNullableText(formState.vin),
        registration_no: toNullableText(formState.registration_no),
        first_registration_month: toNullableText(formState.first_registration_month),
        model_year: toNullableNumber(formState.model_year),
        displacement_cc: toNullableNumber(formState.displacement_cc),
        mileage_km: toNullableNumber(formState.mileage_km),
        color: toNullableText(formState.color),
        inspection_expiry_date: toNullableText(formState.inspection_expiry_date),
        purchase_price: toNullableNumber(formState.purchase_price),
        base_price: toNullableNumber(formState.base_price),
        total_price: toNullableNumber(formState.total_price),
        status: formState.status || '在庫中',
        location_name: toNullableText(formState.location_name),
        description: toNullableText(formState.description),
        internal_memo: toNullableText(formState.internal_memo),
      };

      const { error } = await supabase.from<VehicleInsert>('vehicles').insert(payload);

      if (error) {
        throw new Error(error.message);
      }

      router.push('/vehicles');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '車両登録に失敗しました。');
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      activeLabel="車両管理"
      title="車両登録"
      description="車両台帳・仕入価格・販売価格・古物情報を登録します"
      actionButton={
        <Link
          href="/vehicles"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          一覧に戻る
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="mx-auto max-w-7xl space-y-8">
        {vehicleSections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
              <h3 className="text-lg font-bold text-slate-950">
                {section.title}
              </h3>
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
                      htmlFor={field.type === 'radio' ? undefined : id}
                      className="mb-2 block text-sm font-bold text-slate-700"
                    >
                      {field.label}
                      {field.required && (
                        <span className="ml-2 text-xs font-bold text-red-600">
                          必須
                        </span>
                      )}
                    </label>
                    <FieldControl
                      field={field}
                      id={id}
                      value={field.name ? formState[field.name] : undefined}
                      onChange={
                        field.name
                          ? (value) => updateField(field.name as keyof VehicleFormState, value)
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div ref={saveErrorRef} className="space-y-3">
          {saveError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
              <p>{saveError}</p>
              {saveError === VEHICLE_LIMIT_MESSAGE && (
                <Link href="/settings/billing" className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100">
                  プラン変更を申し込む
                </Link>
              )}
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            href="/vehicles"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            キャンセル
          </Link>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? '登録中...' : '車両を登録する'}
          </button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
