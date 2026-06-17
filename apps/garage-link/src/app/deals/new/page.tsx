'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { createClient } from '@/lib/supabase/client';

type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'time'
  | 'number'
  | 'select'
  | 'textarea';

type DealFormState = {
  customer_id: string;
  vehicle_id: string;
  deal_no: string;
  title: string;
  deal_type: string;
  status: string;
  probability: string;
  source: string;
  budget: string;
  trade_in_status: string;
  loan_request: string;
  next_action_date: string;
  next_action_time: string;
  next_action_type: string;
  assigned_user_name: string;
  line_status: string;
  memo: string;
};

type Field = {
  label: string;
  type: FieldType;
  name?: keyof DealFormState;
  placeholder?: string;
  options?: string[];
  wide?: boolean;
};

type FormSection = {
  title: string;
  description: string;
  fields: Field[];
  note?: string;
};

type StoreMemberRow = {
  store_id: string;
};

type CustomerOption = {
  id: string;
  name: string | null;
  kana: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  line_display_name: string | null;
  line_user_id: string | null;
  line_friend_status: string | null;
  delivery_permission: string | null;
  desired_maker: string | null;
  desired_model: string | null;
  desired_displacement: string | null;
  budget_min: number | null;
  budget_max: number | null;
  desired_purchase_timing: string | null;
  trade_in_status: string | null;
  customer_status: string | null;
  assigned_user_name: string | null;
  next_action_date: string | null;
  memo: string | null;
};

type VehicleOption = {
  id: string;
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
  status: string | null;
  location_name: string | null;
  description: string | null;
  internal_memo: string | null;
};

type DealInsert = {
  store_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  deal_no: string | null;
  title: string;
  deal_type: string | null;
  status: string;
  probability: string | null;
  source: string | null;
  budget: number | null;
  trade_in_status: string | null;
  loan_request: string | null;
  next_action_at: string | null;
  assigned_user_name: string | null;
  line_status: string | null;
  memo: string | null;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const initialFormState: DealFormState = {
  customer_id: '',
  vehicle_id: '',
  deal_no: '',
  title: '',
  deal_type: '',
  status: '新規',
  probability: '',
  source: '',
  budget: '',
  trade_in_status: '',
  loan_request: '',
  next_action_date: '',
  next_action_time: '',
  next_action_type: '',
  assigned_user_name: '',
  line_status: '',
  memo: '',
};

const sections: FormSection[] = [
  {
    title: '商談基本情報',
    description: '商談の概要と管理情報を登録します。',
    fields: [
      { label: '商談番号', type: 'text', name: 'deal_no', placeholder: '例：D-000001' },
      { label: '商談タイトル', type: 'text', name: 'title', placeholder: '例：CB400SF購入相談' },
      { label: '商談種別', type: 'select', name: 'deal_type', options: ['購入相談', '見積依頼', '来店予約', '買取査定', '車検・整備相談', 'カスタム相談', 'その他'] },
      { label: '流入元', type: 'select', name: 'source', options: ['LINE', '電話', '来店', 'Instagram', 'ホームページ', 'カーセンサー', 'グー', '紹介', 'その他'] },
      { label: '受付日', type: 'date' },
      { label: '担当者', type: 'text', name: 'assigned_user_name', placeholder: '例：山田' },
    ],
  },
  {
    title: '顧客情報',
    description: '商談に紐付ける顧客情報を選択・確認します。',
    fields: [
      { label: '顧客選択', type: 'select', name: 'customer_id' },
    ],
  },
  {
    title: '対象車両',
    description: '商談対象の車両を選択します。',
    fields: [],
  },
  {
    title: '商談ステータス',
    description: '現在の商談状況と確度を登録します。',
    fields: [
      { label: '商談ステータス', type: 'select', name: 'status', options: ['新規', '連絡済み', '来店予定', '見積済み', '商談中', '成約', '失注'] },
      { label: '商談確度', type: 'select', name: 'probability', options: ['高', '中', '低', '未定'] },
      { label: '購入希望時期', type: 'select', options: ['すぐ', '1ヶ月以内', '3ヶ月以内', '半年以内', '未定'] },
      { label: '予算', type: 'number', name: 'budget' },
      { label: '下取り有無', type: 'select', name: 'trade_in_status', options: ['あり', 'なし', '未定'] },
      { label: 'ローン希望', type: 'select', name: 'loan_request', options: ['あり', 'なし', '未定'] },
      { label: '失注理由', type: 'select', options: ['未選択', '価格', '他社購入', '連絡不通', '条件不一致', '購入時期延期', 'その他'] },
    ],
  },
  {
    title: 'LINE対応情報',
    description: 'LINEでの案内状況や配信予定を登録します。',
    fields: [
      { label: 'LINE案内状況', type: 'select', name: 'line_status', options: ['未案内', '案内済み', '返信あり', '返信なし', 'ブロック'] },
      { label: '送信予定テンプレート', type: 'select', options: ['車両紹介', '見積案内', '来店予約案内', '車検案内', 'フォローアップ', 'なし'] },
      { label: '次回LINE送信予定日', type: 'date' },
      { label: 'LINE送信用メモ', type: 'textarea', placeholder: '例：入荷車両の詳細と来店予約URLを送る', wide: true },
    ],
  },
  {
    title: '次回対応・メモ',
    description: '次にやる対応と社内メモを登録します。',
    fields: [
      { label: '次回対応日', type: 'date', name: 'next_action_date' },
      { label: '次回対応時間', type: 'time', name: 'next_action_time' },
      { label: '次回対応内容', type: 'select', name: 'next_action_type', options: ['電話', 'LINE', 'メール', '来店対応', '見積送付', '再提案', 'その他'] },
      { label: '対応履歴メモ', type: 'textarea', name: 'memo', placeholder: '例：初回問い合わせ。CB400SFを希望。週末来店予定。', wide: true },
      { label: '社内メモ', type: 'textarea', placeholder: '例：価格相談あり。下取り車あり。', wide: true },
    ],
  },
];

function fieldId(sectionTitle: string, label: string) {
  return `${sectionTitle}-${label}`.replace(/[・\s]/g, '-');
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

function buildNextActionAt(date: string, time: string) {
  if (!date) {
    return null;
  }

  return time ? `${date}T${time}:00` : `${date}T00:00:00`;
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}円`;
}

function formatMileage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}km`;
}

function formatBudget(min: number | null | undefined, max: number | null | undefined) {
  if (min === null || min === undefined) {
    if (max === null || max === undefined) {
      return '-';
    }

    return `〜${max.toLocaleString('ja-JP')}円`;
  }

  if (max === null || max === undefined) {
    return `${min.toLocaleString('ja-JP')}円〜`;
  }

  return `${min.toLocaleString('ja-JP')}円〜${max.toLocaleString('ja-JP')}円`;
}

function formatDisplacement(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}cc`;
}

function vehicleLabel(vehicle: VehicleOption) {
  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '車両名未設定';
}

function statusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case '在庫中':
    case '展示中':
      return 'bg-green-50 text-green-700 ring-green-600/20';
    case '商談中':
    case '整備中':
      return 'bg-yellow-50 text-yellow-700 ring-yellow-600/20';
    case '売約済み':
    case '納車済み':
      return 'bg-slate-100 text-slate-700 ring-slate-600/20';
    default:
      return 'bg-blue-50 text-blue-700 ring-blue-600/20';
  }
}

function VehicleStatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${statusBadgeClass(
        status
      )}`}
    >
      {displayValue(status)}
    </span>
  );
}

function PreviewItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 min-h-5 text-sm font-semibold text-slate-900">
        {displayValue(value)}
      </dd>
    </div>
  );
}

function VehicleSearchPanel({
  vehicles,
  selectedVehicle,
  searchText,
  onSearchTextChange,
  onSelectVehicle,
  onClearVehicle,
}: {
  vehicles: VehicleOption[];
  selectedVehicle?: VehicleOption;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSelectVehicle: (vehicleId: string) => void;
  onClearVehicle: () => void;
}) {
  return (
    <div className="space-y-5 px-5 py-6 sm:px-6">
      <div>
        <label
          htmlFor="vehicle-search"
          className="mb-2 block text-sm font-bold text-slate-700"
        >
          車両検索
        </label>
        <input
          id="vehicle-search"
          type="search"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="管理番号・車両番号・メーカー・車種名で検索"
          className={inputClass}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-950">検索結果</p>
          <p className="mt-1 text-xs text-slate-500">
            候補をクリックすると対象車両として選択されます
          </p>
        </div>

        {vehicles.length === 0 ? (
          <p className="px-4 py-5 text-sm font-semibold text-slate-500">
            該当する車両がありません
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {vehicles.map((vehicle) => {
              const isSelected = vehicle.id === selectedVehicle?.id;

              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => onSelectVehicle(vehicle.id)}
                  className={`block w-full px-4 py-4 text-left transition hover:bg-blue-50 ${
                    isSelected ? 'bg-blue-50' : 'bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-950">
                          {vehicleLabel(vehicle)}
                        </p>
                        <VehicleStatusBadge status={vehicle.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                        <span>管理番号: {displayValue(vehicle.management_no)}</span>
                        <span>
                          車両番号 / 登録番号: {displayValue(vehicle.registration_no)}
                        </span>
                        <span>年式: {displayValue(vehicle.model_year)}</span>
                        <span>走行距離: {formatMileage(vehicle.mileage_km)}</span>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-slate-950">
                      {formatPrice(vehicle.total_price)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedVehicle ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                選択中の車両
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-base font-bold text-slate-950">
                  {vehicleLabel(selectedVehicle)}
                </p>
                <VehicleStatusBadge status={selectedVehicle.status} />
              </div>
              <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700 md:grid-cols-2 xl:grid-cols-4">
                <span>管理番号: {displayValue(selectedVehicle.management_no)}</span>
                <span>
                  車両番号 / 登録番号: {displayValue(selectedVehicle.registration_no)}
                </span>
                <span>メーカー・車種: {vehicleLabel(selectedVehicle)}</span>
                <span>ステータス: {displayValue(selectedVehicle.status)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearVehicle}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              選択を解除
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-700">
          車両を検索して選択してください。対象車両が未選択です。
        </div>
      )}
    </div>
  );
}

function CustomerPreview({ customer }: { customer?: CustomerOption }) {
  if (!customer) {
    return (
      <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-700 sm:mx-6">
        顧客を選択してください
      </div>
    );
  }

  return (
    <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:mx-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            顧客情報プレビュー
          </p>
          <h4 className="mt-1 text-lg font-bold text-slate-950">
            {displayValue(customer.name)}
          </h4>
        </div>
        <p className="text-xs font-semibold text-slate-500">
          選択した顧客情報を自動反映しています
        </p>
      </div>

      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PreviewItem label="顧客名" value={customer.name} />
        <PreviewItem label="電話番号" value={customer.phone} />
        <PreviewItem label="携帯TEL" value={customer.mobile_phone} />
        <PreviewItem label="メールアドレス" value={customer.email} />
        <PreviewItem label="LINE表示名" value={customer.line_display_name} />
        <PreviewItem label="LINE友だち状態" value={customer.line_friend_status} />
        <PreviewItem label="配信許可" value={customer.delivery_permission} />
        <PreviewItem label="希望メーカー" value={customer.desired_maker} />
        <PreviewItem label="希望車種" value={customer.desired_model} />
        <PreviewItem label="希望排気量" value={customer.desired_displacement} />
        <PreviewItem
          label="予算"
          value={formatBudget(customer.budget_min, customer.budget_max)}
        />
        <PreviewItem label="購入希望時期" value={customer.desired_purchase_timing} />
        <PreviewItem label="下取り有無" value={customer.trade_in_status} />
        <PreviewItem label="顧客ステータス" value={customer.customer_status} />
        <PreviewItem label="担当者" value={customer.assigned_user_name} />
        <PreviewItem label="次回対応日" value={customer.next_action_date} />
      </dl>

      {customer.memo && (
        <div className="mt-4 rounded-lg bg-white/80 p-4">
          <p className="text-xs font-bold text-slate-500">顧客メモ</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {customer.memo}
          </p>
        </div>
      )}
    </div>
  );
}

function VehiclePreview({ vehicle }: { vehicle?: VehicleOption }) {
  if (!vehicle) {
    return (
      <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-semibold text-blue-700 sm:mx-6">
        車両を検索して選択してください
      </div>
    );
  }

  return (
    <div className="mx-5 mb-6 rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:mx-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            車両情報プレビュー
          </p>
          <h4 className="mt-1 text-lg font-bold text-slate-950">
            {vehicleLabel(vehicle)}
          </h4>
        </div>
        <p className="text-xs font-semibold text-slate-500">
          選択した車両情報を自動反映しています
        </p>
      </div>

      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <PreviewItem label="管理番号" value={vehicle.management_no} />
        <PreviewItem label="車両タイプ" value={vehicle.vehicle_type} />
        <PreviewItem label="メーカー・車種" value={vehicleLabel(vehicle)} />
        <PreviewItem label="グレード" value={vehicle.grade} />
        <PreviewItem label="車台番号" value={vehicle.vin} />
        <PreviewItem label="登録番号" value={vehicle.registration_no} />
        <PreviewItem label="初度登録年月" value={vehicle.first_registration_month} />
        <PreviewItem label="年式" value={vehicle.model_year} />
        <PreviewItem label="排気量" value={formatDisplacement(vehicle.displacement_cc)} />
        <PreviewItem label="走行距離" value={formatMileage(vehicle.mileage_km)} />
        <PreviewItem label="色" value={vehicle.color} />
        <PreviewItem label="車検満了日" value={vehicle.inspection_expiry_date} />
        <PreviewItem label="車両本体価格" value={formatPrice(vehicle.base_price)} />
        <PreviewItem label="支払総額" value={formatPrice(vehicle.total_price)} />
        <PreviewItem label="ステータス" value={vehicle.status} />
        <PreviewItem label="保管場所" value={vehicle.location_name} />
      </dl>

      {vehicle.description && (
        <div className="mt-4 rounded-lg bg-white/80 p-4">
          <p className="text-xs font-bold text-slate-500">車両コメント</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {vehicle.description}
          </p>
        </div>
      )}
    </div>
  );
}

function FieldControl({
  field,
  id,
  value,
  onChange,
  customerOptions,
  vehicleOptions,
}: {
  field: Field;
  id: string;
  value?: string;
  onChange?: (value: string) => void;
  customerOptions: CustomerOption[];
  vehicleOptions: VehicleOption[];
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
    const options =
      field.name === 'customer_id'
        ? customerOptions.map((customer) => ({
            value: customer.id,
            label: customer.name ?? '名称未設定',
          }))
        : field.name === 'vehicle_id'
          ? vehicleOptions.map((vehicle) => ({
              value: vehicle.id,
              label: vehicleLabel(vehicle),
            }))
          : field.options?.map((option) => ({ value: option, label: option })) ?? [];

    return (
      <select
        id={id}
        className={inputClass}
        defaultValue={onChange === undefined ? '' : undefined}
        {...controlledProps}
      >
        <option value="">
          未選択
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
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

function DealSection({
  section,
  formState,
  updateField,
  customerOptions,
  vehicleOptions,
  selectedCustomer,
  selectedVehicle,
  vehicleSearchText,
  filteredVehicles,
  onVehicleSearchTextChange,
  onClearVehicle,
}: {
  section: FormSection;
  formState: DealFormState;
  updateField: (name: keyof DealFormState, value: string) => void;
  customerOptions: CustomerOption[];
  vehicleOptions: VehicleOption[];
  selectedCustomer?: CustomerOption;
  selectedVehicle?: VehicleOption;
  vehicleSearchText: string;
  filteredVehicles: VehicleOption[];
  onVehicleSearchTextChange: (value: string) => void;
  onClearVehicle: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">{section.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {section.description}
        </p>
      </div>

      {section.title === '対象車両' ? (
        <VehicleSearchPanel
          vehicles={filteredVehicles}
          selectedVehicle={selectedVehicle}
          searchText={vehicleSearchText}
          onSearchTextChange={onVehicleSearchTextChange}
          onSelectVehicle={(vehicleId) => updateField('vehicle_id', vehicleId)}
          onClearVehicle={onClearVehicle}
        />
      ) : (
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
                <FieldControl
                  field={field}
                  id={id}
                  value={field.name ? formState[field.name] : undefined}
                  onChange={
                    field.name
                      ? (value) => updateField(field.name as keyof DealFormState, value)
                      : undefined
                  }
                  customerOptions={customerOptions}
                  vehicleOptions={vehicleOptions}
                />
              </div>
            );
          })}
        </div>
      )}

      {section.title === '顧客情報' && (
        <CustomerPreview customer={selectedCustomer} />
      )}

      {section.title === '対象車両' && (
        <VehiclePreview vehicle={selectedVehicle} />
      )}

      {section.note && (
        <p className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500 sm:px-6">
          ※ {section.note}
        </p>
      )}
    </section>
  );
}

function NewDealPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formState, setFormState] = useState<DealFormState>(initialFormState);
  const [storeId, setStoreId] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleSearchText, setVehicleSearchText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === formState.customer_id);
  }, [customers, formState.customer_id]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find((vehicle) => vehicle.id === formState.vehicle_id);
  }, [formState.vehicle_id, vehicles]);

  const filteredVehicles = useMemo(() => {
    const query = vehicleSearchText.trim().toLowerCase();

    if (query === '') {
      return vehicles;
    }

    return vehicles.filter((vehicle) => {
      return [
        vehicle.management_no,
        vehicle.registration_no,
        vehicle.maker,
        vehicle.model_name,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [vehicleSearchText, vehicles]);

  function updateField(name: keyof DealFormState, value: string) {
    setFormState((current) => {
      if (name === 'customer_id') {
        const customer = customers.find((item) => item.id === value);

        if (!customer) {
          return {
            ...current,
            customer_id: value,
            budget: value === '' ? '' : current.budget,
            trade_in_status: value === '' ? '' : current.trade_in_status,
            assigned_user_name: value === '' ? '' : current.assigned_user_name,
            next_action_date: value === '' ? '' : current.next_action_date,
          };
        }

        return {
          ...current,
          customer_id: value,
          budget:
            customer.budget_max !== null && customer.budget_max !== undefined
              ? String(customer.budget_max)
              : '',
          trade_in_status: customer.trade_in_status ?? '',
          assigned_user_name: customer.assigned_user_name ?? '',
          next_action_date: customer.next_action_date ?? '',
        };
      }

      if (name === 'vehicle_id') {
        const vehicle = vehicles.find((item) => item.id === value);

        if (!vehicle) {
          return {
            ...current,
            vehicle_id: value,
          };
        }

        const title = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''} 商談`
          .replace(/\s+/g, ' ')
          .trim();

        return {
          ...current,
          vehicle_id: value,
          title: current.title.trim() === '' ? title : current.title,
          budget:
            current.budget.trim() === '' &&
            vehicle.total_price !== null &&
            vehicle.total_price !== undefined
              ? String(vehicle.total_price)
              : current.budget,
        };
      }

      return {
        ...current,
        [name]: value,
      };
    });
  }

  function clearVehicleSelection() {
    updateField('vehicle_id', '');
  }

  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true);
      setErrorMessage('');

      try {
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

        setStoreId(member.store_id);

        const [customerResult, vehicleResult] = await Promise.all([
          supabase
            .from<CustomerOption>('customers')
            .select(
              'id, name, kana, phone, mobile_phone, email, line_display_name, line_user_id, line_friend_status, delivery_permission, desired_maker, desired_model, desired_displacement, budget_min, budget_max, desired_purchase_timing, trade_in_status, customer_status, assigned_user_name, next_action_date, memo'
            )
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
          supabase
            .from<VehicleOption>('vehicles')
            .select(
              'id, management_no, vehicle_type, maker, model_name, grade, vin, registration_no, first_registration_month, model_year, displacement_cc, mileage_km, color, inspection_expiry_date, purchase_price, base_price, total_price, status, location_name, description, internal_memo'
            )
            .eq('store_id', member.store_id)
            .order('created_at', { ascending: false }),
        ]);

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        if (vehicleResult.error) {
          throw new Error(vehicleResult.error.message);
        }

        const customerRows = customerResult.data ?? [];
        const vehicleRows = vehicleResult.data ?? [];
        setCustomers(customerRows);
        setVehicles(vehicleRows);

        const initialCustomerId = searchParams.get('customerId') ?? '';
        const initialVehicleId = searchParams.get('vehicleId') ?? '';
        const initialCustomer = customerRows.find((customer) => customer.id === initialCustomerId);
        const initialVehicle = vehicleRows.find((vehicle) => vehicle.id === initialVehicleId);

        if (initialCustomer || initialVehicle) {
          setFormState((current) => {
            const vehicleTitle = initialVehicle
              ? `${initialVehicle.maker ?? ''} ${initialVehicle.model_name ?? ''} 商談`.replace(/\s+/g, ' ').trim()
              : '';

            return {
              ...current,
              customer_id: initialCustomer?.id ?? current.customer_id,
              vehicle_id: initialVehicle?.id ?? current.vehicle_id,
              budget:
                initialCustomer?.budget_max !== null && initialCustomer?.budget_max !== undefined
                  ? String(initialCustomer.budget_max)
                  : initialVehicle?.total_price !== null && initialVehicle?.total_price !== undefined
                    ? String(initialVehicle.total_price)
                    : current.budget,
              trade_in_status: initialCustomer?.trade_in_status ?? current.trade_in_status,
              assigned_user_name: initialCustomer?.assigned_user_name ?? current.assigned_user_name,
              next_action_date: initialCustomer?.next_action_date ?? current.next_action_date,
              title: current.title.trim() === '' && vehicleTitle ? vehicleTitle : current.title,
            };
          });
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '選択肢の取得に失敗しました。');
      } finally {
        setIsLoadingOptions(false);
      }
    }

    void loadOptions();
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);

    try {
      if (!storeId) {
        throw new Error('所属店舗が見つかりません。');
      }

      if (!formState.title.trim()) {
        throw new Error('商談タイトルを入力してください。');
      }

      const supabase = createClient();
      const payload: DealInsert = {
        store_id: storeId,
        customer_id: toNullableText(formState.customer_id),
        vehicle_id: toNullableText(formState.vehicle_id),
        deal_no: toNullableText(formState.deal_no),
        title: formState.title.trim(),
        deal_type: toNullableText(formState.deal_type),
        status: formState.status || '新規',
        probability: toNullableText(formState.probability),
        source: toNullableText(formState.source),
        budget: toNullableNumber(formState.budget),
        trade_in_status: toNullableText(formState.trade_in_status),
        loan_request: toNullableText(formState.loan_request),
        next_action_at: buildNextActionAt(
          formState.next_action_date,
          formState.next_action_time
        ),
        assigned_user_name: toNullableText(formState.assigned_user_name),
        line_status: toNullableText(formState.line_status),
        memo: toNullableText(
          [formState.next_action_type, formState.memo]
            .filter((value) => value.trim() !== '')
            .join('\n')
        ),
      };

      const { error } = await supabase.from<DealInsert>('deals').insert(payload);

      if (error) {
        throw new Error(error.message);
      }

      router.push('/deals');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '商談登録に失敗しました。');
      setIsSaving(false);
    }
  }

  const optionHelpText = useMemo(() => {
    if (isLoadingOptions) {
      return '顧客・車両の選択肢を読み込み中です...';
    }

    if (customers.length === 0 && vehicles.length === 0) {
      return '顧客または車両が未登録の場合でも、商談の基本情報は登録できます。';
    }

    return '';
  }, [customers.length, isLoadingOptions, vehicles.length]);

  return (
    <AppShell
      activeLabel="商談管理"
      title="商談登録"
      description="顧客・対象車両・商談状況・次回対応予定を登録します"
      actionButton={
        <Link
          href="/deals"
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

        {optionHelpText && (
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
            {optionHelpText}
          </p>
        )}

        {sections.map((section) => (
          <DealSection
            key={section.title}
            section={section}
            formState={formState}
            updateField={updateField}
            customerOptions={customers}
            vehicleOptions={vehicles}
            selectedCustomer={selectedCustomer}
            selectedVehicle={selectedVehicle}
            vehicleSearchText={vehicleSearchText}
            filteredVehicles={filteredVehicles}
            onVehicleSearchTextChange={setVehicleSearchText}
            onClearVehicle={clearVehicleSelection}
          />
        ))}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
          <Link
            href="/deals"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            キャンセル
          </Link>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? '登録中...' : '商談を登録する'}
          </button>
        </div>

        <p className="text-xs text-slate-500">
          ※ 顧客・車両の選択内容を反映して、商談情報をSupabaseへ保存します。
        </p>
      </form>
    </AppShell>
  );
}

export default function NewDealPage() {
  return (
    <Suspense
      fallback={
        <AppShell
          activeLabel="商談管理"
          title="商談登録"
          description="顧客・対象車両・商談状況・次回対応予定を登録します"
        >
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">
            読み込み中...
          </section>
        </AppShell>
      }
    >
      <NewDealPageContent />
    </Suspense>
  );
}
