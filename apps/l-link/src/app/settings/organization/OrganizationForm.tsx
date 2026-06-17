"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { OrganizationState } from "./types";

type SaveOrganizationAction = (
  prevState: OrganizationState,
  formData: FormData,
) => Promise<OrganizationState>;

type OrganizationFormProps = {
  initialState: OrganizationState;
  saveAction: SaveOrganizationAction;
};

export function OrganizationForm({ initialState, saveAction }: OrganizationFormProps) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const fields = state.fields;
  const formKey = [
    state.status,
    state.message,
    fields.companyName,
    fields.storeName,
    fields.contactName,
    fields.phone,
    fields.email,
    fields.businessType,
    fields.prefecture,
    fields.address,
  ].join(":");

  return (
    <div className="space-y-4">
      {state.message ? (
        <div
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            state.status === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <p>{state.message}</p>
          {state.status === "success" ? (
            <Link href="/settings/line" className="mt-2 inline-block rounded-lg bg-green-600 px-3 py-2 text-xs text-white">
              LINE接続設定へ進む
            </Link>
          ) : null}
        </div>
      ) : null}

      <form key={formKey} action={formAction} className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-slate-500">会社名</span>
          <input
            name="company_name"
            required
            defaultValue={fields.companyName}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">店舗名 任意</span>
          <input
            name="store_name"
            defaultValue={fields.storeName}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">担当者名</span>
          <input
            name="contact_name"
            defaultValue={fields.contactName}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">電話番号</span>
          <input
            name="phone"
            defaultValue={fields.phone}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">メールアドレス</span>
          <input
            name="email"
            type="email"
            defaultValue={fields.email}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">業種</span>
          <input
            name="business_type"
            defaultValue={fields.businessType}
            placeholder="例：自動車販売店、バイク販売店、美容サロン"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">都道府県</span>
          <input
            name="prefecture"
            defaultValue={fields.prefecture}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">住所 任意</span>
          <input
            name="address"
            defaultValue={fields.address}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <button disabled={pending} className="rounded-xl bg-green-600 px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {pending ? "保存中" : "保存する"}
          </button>
          <Link href="/settings/line" className="rounded-xl border border-green-200 px-5 py-2 text-sm font-bold text-green-700 hover:bg-green-50">
            LINE接続設定へ戻る
          </Link>
        </div>
      </form>
    </div>
  );
}
