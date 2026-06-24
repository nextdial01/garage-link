'use client';

import Link from 'next/link';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import BrandLogo from '@/components/BrandLogo';
import PermissionDeniedCard from '@/components/PermissionDeniedCard';
import { createClient } from '@/lib/supabase/client';
import { canManageSettings, getRoleLabel } from '@/lib/auth/permissions';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type CompanyFormState = {
  name: string;
  company_name: string;
  company_kana: string;
  representative_name: string;
  invoice_registration_number: string;
  postal_code: string;
  address: string;
  building: string;
  phone: string;
  fax: string;
  email: string;
  website_url: string;
  bank_name: string;
  bank_branch_name: string;
  bank_account_type: string;
  bank_account_number: string;
  bank_account_holder: string;
  quote_note: string;
  invoice_note: string;
  logo_image_path: string;
  seal_image_path: string;
  document_primary_color: string;
  document_footer_text: string;
};

type StoreRow = CompanyFormState & {
  id: string;
};

type StoreUpdate = Partial<CompanyFormState>;

type StorageUploadResponse = {
  ok: boolean;
  file?: {
    id: string;
    path: string;
  };
  error?: string;
};

type SignedUrlResponse = {
  ok: boolean;
  signedUrl?: string;
  error?: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

const emptyForm: CompanyFormState = {
  name: '',
  company_name: '',
  company_kana: '',
  representative_name: '',
  invoice_registration_number: '',
  postal_code: '',
  address: '',
  building: '',
  phone: '',
  fax: '',
  email: '',
  website_url: '',
  bank_name: '',
  bank_branch_name: '',
  bank_account_type: '',
  bank_account_number: '',
  bank_account_holder: '',
  quote_note: '',
  invoice_note: '',
  logo_image_path: '',
  seal_image_path: '',
  document_primary_color: '#2563eb',
  document_footer_text: '',
};

function valueOrEmpty(value: string | null | undefined) {
  return value ?? '';
}

function fieldId(label: string) {
  return label.replace(/[・\s/]/g, '-');
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold text-slate-700">
      {children}
    </label>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="px-5 py-6 sm:px-6">{children}</div>
    </section>
  );
}

function ImagePreview({
  label,
  path,
  publicUrl,
}: {
  label: string;
  path: string;
  publicUrl: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-700">{label}</p>
      {publicUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicUrl}
          alt={label}
          className="mt-3 max-h-28 rounded-lg border border-slate-200 bg-white object-contain p-2"
        />
      ) : (
        <div className="mt-3 flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-400">
          未設定
        </div>
      )}
      <p className="mt-2 break-all text-xs text-slate-500">{path || '-'}</p>
    </div>
  );
}

export default function CompanySettingsPage() {
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [formState, setFormState] = useState<CompanyFormState>(emptyForm);
  const [logoUrl, setLogoUrl] = useState('');
  const [sealUrl, setSealUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  function updateField(name: keyof CompanyFormState, value: string) {
    setFormState((current) => ({
      ...current,
      [name]: value,
    }));
  }

  const setImageUrls = useCallback(async (nextForm: CompanyFormState) => {
    async function signedUrl(path: string) {
      if (!path) return '';

      const response = await fetch('/api/storage/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const payload = await response.json().catch(() => null) as SignedUrlResponse | null;
      return response.ok && payload?.ok ? payload.signedUrl ?? '' : '';
    }

    const [nextLogoUrl, nextSealUrl] = await Promise.all([
      signedUrl(nextForm.logo_image_path),
      signedUrl(nextForm.seal_image_path),
    ]);

    setLogoUrl(nextLogoUrl);
    setSealUrl(nextSealUrl);
  }, []);

  useEffect(() => {
    async function loadStore() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user?.id) {
          throw new Error(userError?.message ?? 'ログイン情報を取得できませんでした。');
        }

        const { data: member, error: memberError } = await supabase
          .from<StoreMemberRow>('store_members')
          .select('store_id, role')
          .eq('user_id', userData.user.id)
          .single();

        if (memberError || !member?.store_id) {
          throw new Error(memberError?.message ?? '所属店舗が見つかりません。');
        }

        setStoreId(member.store_id);
        setRole(member.role ?? '');

        const { data: store, error: storeError } = await supabase
          .from<StoreRow>('stores')
          .select(
            'id, name, company_name, company_kana, representative_name, invoice_registration_number, postal_code, address, building, phone, fax, email, website_url, bank_name, bank_branch_name, bank_account_type, bank_account_number, bank_account_holder, quote_note, invoice_note, logo_image_path, seal_image_path, document_primary_color, document_footer_text'
          )
          .eq('id', member.store_id)
          .single();

        if (storeError || !store) {
          throw new Error(storeError?.message ?? '店舗情報を取得できませんでした。');
        }

        const nextForm: CompanyFormState = {
          name: valueOrEmpty(store.name),
          company_name: valueOrEmpty(store.company_name),
          company_kana: valueOrEmpty(store.company_kana),
          representative_name: valueOrEmpty(store.representative_name),
          invoice_registration_number: valueOrEmpty(store.invoice_registration_number),
          postal_code: valueOrEmpty(store.postal_code),
          address: valueOrEmpty(store.address),
          building: valueOrEmpty(store.building),
          phone: valueOrEmpty(store.phone),
          fax: valueOrEmpty(store.fax),
          email: valueOrEmpty(store.email),
          website_url: valueOrEmpty(store.website_url),
          bank_name: valueOrEmpty(store.bank_name),
          bank_branch_name: valueOrEmpty(store.bank_branch_name),
          bank_account_type: valueOrEmpty(store.bank_account_type),
          bank_account_number: valueOrEmpty(store.bank_account_number),
          bank_account_holder: valueOrEmpty(store.bank_account_holder),
          quote_note: valueOrEmpty(store.quote_note),
          invoice_note: valueOrEmpty(store.invoice_note),
          logo_image_path: valueOrEmpty(store.logo_image_path),
          seal_image_path: valueOrEmpty(store.seal_image_path),
          document_primary_color: store.document_primary_color || '#2563eb',
          document_footer_text: valueOrEmpty(store.document_footer_text),
        };

        setFormState(nextForm);
        await setImageUrls(nextForm);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '会社情報の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    }

    void loadStore();
  }, [setImageUrls, supabase]);

  async function uploadImage(kind: 'logo' | 'seal', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !storeId) {
      return;
    }
    if (!canManageSettings(role)) {
      setErrorMessage('この機能を利用する権限がありません。管理者に確認してください。');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', kind === 'logo' ? 'company_logo' : 'company_seal');

      const uploadResponse = await fetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadPayload = await uploadResponse.json().catch(() => null) as StorageUploadResponse | null;

      if (!uploadResponse.ok || !uploadPayload?.ok || !uploadPayload.file?.path) {
        throw new Error(uploadPayload?.error ?? '画像アップロードに失敗しました。');
      }

      const key = kind === 'logo' ? 'logo_image_path' : 'seal_image_path';
      const updatePayload: StoreUpdate = { [key]: uploadPayload.file.path };
      const { error: updateError } = await supabase
        .from<StoreUpdate>('stores')
        .update(updatePayload)
        .eq('id', storeId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const nextForm = { ...formState, [key]: uploadPayload.file.path };
      setFormState(nextForm);
      await setImageUrls(nextForm);
      setSuccessMessage('画像をアップロードしました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '画像アップロードに失敗しました。');
    } finally {
      setIsUploading(false);
    }
  }

  async function saveSettings() {
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (!storeId) {
        throw new Error('所属店舗が見つかりません。');
      }
      if (!canManageSettings(role)) {
        throw new Error('この機能を利用する権限がありません。管理者に確認してください。');
      }

      const payload: StoreUpdate = { ...formState };
      const { error } = await supabase
        .from<StoreUpdate>('stores')
        .update(payload)
        .eq('id', storeId);

      if (error) {
        throw new Error(error.message);
      }

      setImageUrls(formState);
      setSuccessMessage('会社情報・帳票設定を保存しました。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }

  const fields: Array<[keyof CompanyFormState, string, string, string?]> = [
    ['name', '会社名 / 店舗名', 'text'],
    ['company_name', '会社名', 'text'],
    ['company_kana', '会社名カナ', 'text'],
    ['representative_name', '代表者名', 'text'],
    ['invoice_registration_number', '適格請求書登録番号', 'text', '例：T1234567890123'],
  ];

  return (
    <AppShell
      activeLabel="設定"
      title="会社情報・帳票設定"
      description="見積書・請求書に表示する会社情報、振込先、ロゴ、角印を設定します"
      actionButton={
        <Link
          href="/settings"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          設定に戻る
        </Link>
      }
    >
      <div className="mx-auto max-w-7xl space-y-8">
        {errorMessage && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <p className="rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm">
            読み込み中...
          </p>
        ) : !canManageSettings(role) ? (
          <PermissionDeniedCard />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm">
                現在の権限: {getRoleLabel(role)}
              </div>
              <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <BrandLogo className="h-12 w-56 max-w-full" />
              </div>
            </div>
            <FormSection title="会社基本情報" description="帳票に表示する会社名や代表者情報を設定します。">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {fields.map(([key, label, type, placeholder]) => {
                  const id = fieldId(label);
                  return (
                    <div key={key} className={key === 'invoice_registration_number' ? 'xl:col-span-2' : ''}>
                      <FieldLabel htmlFor={id}>{label}</FieldLabel>
                      <input
                        id={id}
                        type={type}
                        value={formState[key]}
                        onChange={(event) => updateField(key, event.target.value)}
                        placeholder={placeholder}
                        className={inputClass}
                      />
                    </div>
                  );
                })}
              </div>
            </FormSection>

            <FormSection title="住所・連絡先" description="住所、電話番号、メール、Webサイトを設定します。">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ['postal_code', '郵便番号', 'text'],
                  ['address', '住所', 'text'],
                  ['building', '建物名', 'text'],
                  ['phone', '電話番号', 'tel'],
                  ['fax', 'FAX', 'tel'],
                  ['email', 'メールアドレス', 'email'],
                  ['website_url', 'WebサイトURL', 'url'],
                ].map(([key, label, type]) => {
                  const name = key as keyof CompanyFormState;
                  return (
                    <div key={key} className={key === 'address' ? 'md:col-span-2' : ''}>
                      <FieldLabel htmlFor={key}>{label}</FieldLabel>
                      <input
                        id={key}
                        type={type}
                        value={formState[name]}
                        onChange={(event) => updateField(name, event.target.value)}
                        className={inputClass}
                      />
                    </div>
                  );
                })}
              </div>
            </FormSection>

            <FormSection title="振込先情報" description="請求書に表示する振込先を設定します。">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="bank_name">銀行名</FieldLabel>
                  <input id="bank_name" type="text" value={formState.bank_name} onChange={(event) => updateField('bank_name', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="bank_branch_name">支店名</FieldLabel>
                  <input id="bank_branch_name" type="text" value={formState.bank_branch_name} onChange={(event) => updateField('bank_branch_name', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="bank_account_type">口座種別</FieldLabel>
                  <select id="bank_account_type" value={formState.bank_account_type} onChange={(event) => updateField('bank_account_type', event.target.value)} className={inputClass}>
                    <option value="">未選択</option>
                    {['普通', '当座'].map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor="bank_account_number">口座番号</FieldLabel>
                  <input id="bank_account_number" type="text" value={formState.bank_account_number} onChange={(event) => updateField('bank_account_number', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="bank_account_holder">口座名義</FieldLabel>
                  <input id="bank_account_holder" type="text" value={formState.bank_account_holder} onChange={(event) => updateField('bank_account_holder', event.target.value)} className={inputClass} />
                </div>
              </div>
            </FormSection>

            <FormSection title="帳票表示設定" description="見積書・請求書の備考、色、フッターを設定します。">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="quote_note">見積書備考</FieldLabel>
                  <textarea id="quote_note" rows={5} value={formState.quote_note} onChange={(event) => updateField('quote_note', event.target.value)} placeholder="例：本見積は発行日より14日間有効です。" className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="invoice_note">請求書備考</FieldLabel>
                  <textarea id="invoice_note" rows={5} value={formState.invoice_note} onChange={(event) => updateField('invoice_note', event.target.value)} placeholder="例：お支払いは期日までにお願いいたします。" className={inputClass} />
                </div>
                <div>
                  <FieldLabel htmlFor="document_primary_color">帳票メインカラー</FieldLabel>
                  <input id="document_primary_color" type="color" value={formState.document_primary_color || '#2563eb'} onChange={(event) => updateField('document_primary_color', event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" />
                </div>
                <div>
                  <FieldLabel htmlFor="document_footer_text">フッター文言</FieldLabel>
                  <input id="document_footer_text" type="text" value={formState.document_footer_text} onChange={(event) => updateField('document_footer_text', event.target.value)} placeholder="例：GARAGE LINK" className={inputClass} />
                </div>
              </div>
            </FormSection>

            <FormSection title="画像設定" description="ロゴ画像と角印画像をアップロードします。">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <FieldLabel htmlFor="logo_upload">ロゴ画像アップロード</FieldLabel>
                  <input id="logo_upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadImage('logo', event)} className={inputClass} />
                  <p className="mt-2 text-xs text-slate-500">保存先: private bucket / tenants/.../company/logo</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <FieldLabel htmlFor="seal_upload">角印画像アップロード</FieldLabel>
                  <input id="seal_upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadImage('seal', event)} className={inputClass} />
                  <p className="mt-2 text-xs text-slate-500">保存先: private bucket / tenants/.../company/seal</p>
                </div>
                <ImagePreview label="ロゴ画像プレビュー" path={formState.logo_image_path} publicUrl={logoUrl} />
                <ImagePreview label="角印画像プレビュー" path={formState.seal_image_path} publicUrl={sealUrl} />
              </div>
              <p className="mt-4 text-xs text-slate-500">
                ※ Supabase Storage bucket「company-assets」をprivateで作成してください。画像URLは必要時に短時間の署名URLとして発行します。
              </p>
            </FormSection>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
              <Link href="/settings" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                設定に戻る
              </Link>
              <button type="button" disabled={isSaving || isUploading} onClick={() => void saveSettings()} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {isSaving ? '保存中...' : '保存する'}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
