type StoreOnboardingRow = {
  id: string;
  name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  address?: string | null;
  representative_name?: string | null;
  onboarding_completed_at?: string | null;
};

type SupabaseLike = {
  from: (relation: string) => unknown;
};

function isMissingColumnError(message: string): boolean {
  return /onboarding_completed_at|column .* does not exist/i.test(message);
}

/** onboarding_completed_at 列が未適用のDBでも動くようフォールバック付きで取得 */
export async function fetchStoreOnboardingStatus(
  supabase: SupabaseLike,
  storeId: string
): Promise<{ onboardingCompleted: boolean; errorMessage: string | null }> {
  const client = supabase.from('stores') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { onboarding_completed_at?: string | null } | null; error: { message?: string } | null }>;
      };
    };
  };

  const { data: store, error } = await client
    .select('onboarding_completed_at')
    .eq('id', storeId)
    .maybeSingle();

  if (!error) {
    return { onboardingCompleted: Boolean(store?.onboarding_completed_at), errorMessage: null };
  }

  const message = error.message ?? '';
  if (isMissingColumnError(message)) {
    return { onboardingCompleted: false, errorMessage: null };
  }

  return { onboardingCompleted: false, errorMessage: message };
}

export async function fetchStoreForOnboarding(
  supabase: SupabaseLike,
  storeId: string
): Promise<{ store: StoreOnboardingRow | null; errorMessage: string | null }> {
  const client = supabase.from('stores') as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: StoreOnboardingRow | null; error: { message?: string } | null }>;
      };
    };
  };

  const fullSelect = await client
    .select('id, name, company_name, phone, address, representative_name, onboarding_completed_at')
    .eq('id', storeId)
    .single();

  if (!fullSelect.error && fullSelect.data) {
    return { store: fullSelect.data, errorMessage: null };
  }

  const message = fullSelect.error?.message ?? '';
  if (isMissingColumnError(message)) {
    const fallback = await client
      .select('id, name, company_name, phone, address, representative_name')
      .eq('id', storeId)
      .single();

    if (fallback.error || !fallback.data) {
      return { store: null, errorMessage: fallback.error?.message ?? message };
    }

    return {
      store: { ...fallback.data, onboarding_completed_at: null },
      errorMessage: null,
    };
  }

  return { store: null, errorMessage: message || '店舗情報の読み込みに失敗しました。' };
}

export async function markOnboardingComplete(
  supabase: SupabaseLike,
  storeId: string
): Promise<{ ok: boolean; errorMessage: string | null; migrationRequired: boolean }> {
  const client = supabase.from('stores') as {
    update: (values: Record<string, string>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  };

  const { error } = await client
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', storeId);

  if (!error) {
    return { ok: true, errorMessage: null, migrationRequired: false };
  }

  const message = error.message ?? '';
  if (isMissingColumnError(message)) {
    return {
      ok: true,
      errorMessage: null,
      migrationRequired: true,
    };
  }

  return { ok: false, errorMessage: message, migrationRequired: false };
}
