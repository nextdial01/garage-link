'use client';

export type PaymentItem = {
  id: string;
  method: string;
  amount: string;
  scheduledDate: string;
  note: string;
};

export type TradeInState = {
  enabled: string;
  maker: string;
  modelName: string;
  grade: string;
  modelYear: string;
  mileageKm: string;
  vin: string;
  registrationNo: string;
  inspectionExpiryDate: string;
  color: string;
  conditionStatus: string;
  appraisalAmount: string;
  loanBalance: string;
  tradeInAmount: string;
  memo: string;
};

export type VehicleCandidate = {
  id: string;
  management_no: string | null;
  registration_no: string | null;
  maker: string | null;
  model_name: string | null;
  model_year: number | null;
  mileage_km: number | null;
  total_price: number | null;
  status: string | null;
};

export const emptyTradeIn: TradeInState = {
  enabled: 'なし',
  maker: '',
  modelName: '',
  grade: '',
  modelYear: '',
  mileageKm: '',
  vin: '',
  registrationNo: '',
  inspectionExpiryDate: '',
  color: '',
  conditionStatus: '',
  appraisalAmount: '',
  loanBalance: '',
  tradeInAmount: '',
  memo: '',
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

function toNumber(value: string) {
  const numberValue = Number(value);
  return value.trim() === '' || Number.isNaN(numberValue) ? 0 : numberValue;
}

function formatPrice(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function formatMileage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `${value.toLocaleString('ja-JP')}km`;
}

function vehicleLabel(vehicle: VehicleCandidate) {
  const name = `${vehicle.maker ?? ''} ${vehicle.model_name ?? ''}`.trim();
  return name || vehicle.management_no || '車両名未設定';
}

function fieldLabel(id: string, label: string) {
  return (
    <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-700">
      {label}
    </label>
  );
}

export function paymentTotal(items: PaymentItem[]) {
  return items.reduce((total, item) => total + toNumber(item.amount), 0);
}

export function createPaymentItem(): PaymentItem {
  return {
    id: crypto.randomUUID(),
    method: '',
    amount: '',
    scheduledDate: '',
    note: '',
  };
}

export function PaymentPlanSection({
  title,
  totalAmount,
  items,
  setItems,
}: {
  title: string;
  totalAmount: number;
  items: PaymentItem[];
  setItems: (items: PaymentItem[]) => void;
}) {
  const total = paymentTotal(items);
  const difference = totalAmount - total;

  function updateItem(id: string, key: keyof PaymentItem, value: string) {
    setItems(
      items.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">支払方法内訳</h3>
        <p className="mt-1 text-sm text-slate-500">
          現金、振込、ローン、カードなどを組み合わせて入力します。
        </p>
      </div>

      <div className="space-y-4 px-5 py-6 sm:px-6">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.2fr_1fr_1fr_1.5fr_auto]"
          >
            <div>
              {fieldLabel(`payment-method-${item.id}`, '支払方法')}
              <select
                id={`payment-method-${item.id}`}
                value={item.method}
                onChange={(event) => updateItem(item.id, 'method', event.target.value)}
                className={inputClass}
              >
                <option value="">未選択</option>
                {['現金', '銀行振込', 'クレジットカード', 'オートローン', 'Stripe決済', '下取り充当', 'その他'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {fieldLabel(`payment-amount-${item.id}`, '金額')}
              <input
                id={`payment-amount-${item.id}`}
                type="number"
                value={item.amount}
                onChange={(event) => updateItem(item.id, 'amount', event.target.value)}
                className={`${inputClass} text-right`}
              />
            </div>
            <div>
              {fieldLabel(`payment-date-${item.id}`, '支払予定日')}
              <input
                id={`payment-date-${item.id}`}
                type="date"
                value={item.scheduledDate}
                onChange={(event) =>
                  updateItem(item.id, 'scheduledDate', event.target.value)
                }
                className={inputClass}
              />
            </div>
            <div>
              {fieldLabel(`payment-note-${item.id}`, '備考')}
              <input
                id={`payment-note-${item.id}`}
                type="text"
                value={item.note}
                onChange={(event) => updateItem(item.id, 'note', event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setItems(items.filter((target) => target.id !== item.id))}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                削除
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-400 lg:col-span-5">
              支払方法 {index + 1}
            </p>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setItems([...items, createPaymentItem()])}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
        >
          支払方法を追加
        </button>

        <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-500">{title}</p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {formatPrice(totalAmount)}
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-500">支払方法合計</p>
            <p className="mt-1 text-lg font-bold text-slate-950">
              {formatPrice(total)}
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-500">差額</p>
            <p className={`mt-1 text-lg font-bold ${difference === 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatPrice(difference)}
            </p>
            <p className="mt-1 text-xs font-bold">
              {difference === 0 ? '支払金額が一致しています' : '差額があります'}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          ※ 後で payment_items テーブルを追加し、支払内訳として保存する想定です。
        </p>
      </div>
    </section>
  );
}

export function TradeInSection({
  tradeIn,
  setTradeIn,
}: {
  tradeIn: TradeInState;
  setTradeIn: (value: TradeInState) => void;
}) {
  function update(key: keyof TradeInState, value: string) {
    setTradeIn({ ...tradeIn, [key]: value });
  }

  return (
    <section id="trade-in-section" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">下取り車両情報</h3>
        <p className="mt-1 text-sm text-slate-500">
          下取り車両の情報と査定額を登録します。
        </p>
      </div>
      <div className="space-y-5 px-5 py-6 sm:px-6">
        <div className="max-w-xs">
          {fieldLabel('trade-enabled', '下取り有無')}
          <select
            id="trade-enabled"
            value={tradeIn.enabled}
            onChange={(event) => update('enabled', event.target.value)}
            className={inputClass}
          >
            {['なし', 'あり', '未定'].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {tradeIn.enabled === 'あり' && (
          <>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['maker', 'メーカー', 'text'],
                ['modelName', '車種名', 'text'],
                ['grade', 'グレード', 'text'],
                ['modelYear', '年式', 'number'],
                ['mileageKm', '走行距離', 'number'],
                ['vin', '車台番号', 'text'],
                ['registrationNo', '登録番号', 'text'],
                ['inspectionExpiryDate', '車検満了日', 'date'],
                ['color', '色', 'text'],
              ].map(([key, label, type]) => (
                <div key={key}>
                  {fieldLabel(`trade-${key}`, label)}
                  <input
                    id={`trade-${key}`}
                    type={type}
                    value={tradeIn[key as keyof TradeInState]}
                    onChange={(event) =>
                      update(key as keyof TradeInState, event.target.value)
                    }
                    className={`${inputClass} ${type === 'number' ? 'text-right' : ''}`}
                  />
                </div>
              ))}
              <div>
                {fieldLabel('conditionStatus', '状態')}
                <select
                  id="conditionStatus"
                  value={tradeIn.conditionStatus}
                  onChange={(event) => update('conditionStatus', event.target.value)}
                  className={inputClass}
                >
                  <option value="">未選択</option>
                  {['良好', '普通', '要修理', '不動', '不明'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              {[
                ['appraisalAmount', '査定額'],
                ['loanBalance', 'ローン残債'],
                ['tradeInAmount', '下取り充当額'],
              ].map(([key, label]) => (
                <div key={key}>
                  {fieldLabel(`trade-${key}`, label)}
                  <input
                    id={`trade-${key}`}
                    type="number"
                    value={tradeIn[key as keyof TradeInState]}
                    onChange={(event) =>
                      update(key as keyof TradeInState, event.target.value)
                    }
                    className={`${inputClass} text-right`}
                  />
                </div>
              ))}
              <div className="md:col-span-2 xl:col-span-3">
                {fieldLabel('trade-memo', '下取りメモ')}
                <textarea
                  id="trade-memo"
                  rows={5}
                  value={tradeIn.memo}
                  onChange={(event) => update('memo', event.target.value)}
                  placeholder="例：外装傷あり。現車確認後に最終査定。"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm sm:grid-cols-3">
              <div>
                <p className="font-semibold text-slate-500">査定額</p>
                <p className="mt-1 text-lg font-bold">{formatPrice(toNumber(tradeIn.appraisalAmount))}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">ローン残債</p>
                <p className="mt-1 text-lg font-bold">{formatPrice(toNumber(tradeIn.loanBalance))}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">下取り充当額</p>
                <p className="mt-1 text-lg font-bold text-blue-700">{formatPrice(toNumber(tradeIn.tradeInAmount))}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function VehicleReplacementSection({
  currentVehicle,
  vehicles,
  searchText,
  setSearchText,
  onSelectVehicle,
  actionLabel = 'この車両を選択',
}: {
  currentVehicle: VehicleCandidate | null;
  vehicles: VehicleCandidate[];
  searchText: string;
  setSearchText: (value: string) => void;
  onSelectVehicle: (vehicle: VehicleCandidate) => void;
  actionLabel?: string;
}) {
  const query = searchText.trim().toLowerCase();
  const filteredVehicles =
    query === ''
      ? vehicles
      : vehicles.filter((vehicle) =>
          [
            vehicle.management_no,
            vehicle.registration_no,
            vehicle.maker,
            vehicle.model_name,
          ].some((value) => value?.toLowerCase().includes(query))
        );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">車両差し替え</h3>
        <p className="mt-1 text-sm text-slate-500">
          管理番号、登録番号、メーカー、車種名で検索できます。
        </p>
      </div>
      <div className="space-y-5 px-5 py-6 sm:px-6">
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <p className="text-xs font-bold text-blue-700">現在の車両</p>
          <p className="mt-1 text-base font-bold text-slate-950">
            {currentVehicle ? vehicleLabel(currentVehicle) : '-'}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            管理番号: {displayValue(currentVehicle?.management_no)} / 登録番号:{' '}
            {displayValue(currentVehicle?.registration_no)}
          </p>
        </div>

        <div>
          {fieldLabel('vehicle-replace-search', '差し替え候補を検索')}
          <input
            id="vehicle-replace-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="管理番号・登録番号・メーカー・車種名で検索"
            className={inputClass}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          {filteredVehicles.length === 0 ? (
            <p className="p-4 text-sm font-semibold text-slate-500">
              該当する車両がありません
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredVehicles.map((vehicle) => (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => onSelectVehicle(vehicle)}
                  className="block w-full px-4 py-4 text-left transition hover:bg-blue-50"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-950">
                        {vehicleLabel(vehicle)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        管理番号: {displayValue(vehicle.management_no)} / 登録番号:{' '}
                        {displayValue(vehicle.registration_no)} / 年式:{' '}
                        {displayValue(vehicle.model_year)} / 走行距離:{' '}
                        {formatMileage(vehicle.mileage_km)}
                      </p>
                    </div>
                    <div className="text-sm font-bold text-slate-950">
                      <p>{formatPrice(vehicle.total_price ?? 0)}</p>
                      <p className="mt-1 text-xs text-blue-700">{actionLabel}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
