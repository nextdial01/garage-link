declare module '@supabase/ssr' {
  type AuthUser = {
    id: string;
    email?: string | null;
  };

  type AuthError = {
    message: string;
    code?: string;
  };

  type AuthResponse = {
    data: {
      user: AuthUser | null;
      session: unknown | null;
    };
    error: AuthError | null;
  };

  type QueryResponse<T> = {
    data: T | null;
    error: AuthError | null;
    count?: number | null;
  };

  type QueryBuilder<TRecord extends object> =
    PromiseLike<QueryResponse<TRecord[]>> & {
    insert<TValues extends object>(values: TValues): QueryBuilder<TRecord>;
    upsert<TValues extends object>(
      values: TValues,
      options?: { onConflict?: string }
    ): QueryBuilder<TRecord>;
    update<TValues extends object>(values: TValues): QueryBuilder<TRecord>;
    delete(): QueryBuilder<TRecord>;
    select(
      columns?: string,
      options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }
    ): QueryBuilder<TRecord>;
    eq(column: string, value: unknown): QueryBuilder<TRecord>;
    gte(column: string, value: unknown): QueryBuilder<TRecord>;
    lte(column: string, value: unknown): QueryBuilder<TRecord>;
    in(column: string, values: unknown[]): QueryBuilder<TRecord>;
    or(filters: string): QueryBuilder<TRecord>;
    order(
      column: string,
      options?: { ascending?: boolean }
    ): QueryBuilder<TRecord>;
    range(from: number, to: number): QueryBuilder<TRecord>;
    limit(count: number): QueryBuilder<TRecord>;
    single(): Promise<QueryResponse<TRecord>>;
    maybeSingle(): Promise<QueryResponse<TRecord>>;
  };

  type SupabaseClient = {
    auth: {
      getSession(): Promise<{
        data: { session: { user: AuthUser | null } | null };
        error: AuthError | null;
      }>;
      getUser(): Promise<{
        data: { user: AuthUser | null };
        error: AuthError | null;
      }>;
      getClaims(): Promise<{
        data: { claims: { sub?: string; email?: string; aal?: 'aal1' | 'aal2'; session_id?: string } | null };
        error: AuthError | null;
      }>;
      signInWithPassword(credentials: {
        email: string;
        password: string;
        options?: { captchaToken?: string };
      }): Promise<AuthResponse>;
      signUp(credentials: {
        email: string;
        password: string;
        options?: { captchaToken?: string; emailRedirectTo?: string };
      }): Promise<AuthResponse>;
      signOut(): Promise<{ error: AuthError | null }>;
      resetPasswordForEmail(
        email: string,
        options?: { redirectTo?: string; captchaToken?: string }
      ): Promise<{ data: unknown; error: AuthError | null }>;
      updateUser(credentials: {
        password: string;
      }): Promise<{ data: { user: AuthUser | null }; error: AuthError | null }>;
      exchangeCodeForSession(code: string): Promise<{
        data: { session: unknown; user: AuthUser | null };
        error: AuthError | null;
      }>;
      setSession(credentials: {
        access_token: string;
        refresh_token: string;
      }): Promise<{ data: { session: unknown; user: AuthUser | null }; error: AuthError | null }>;
      mfa: {
        getAuthenticatorAssuranceLevel(): Promise<{
          data: { currentLevel: 'aal1' | 'aal2' | null; nextLevel: 'aal1' | 'aal2' | null } | null;
          error: AuthError | null;
        }>;
        listFactors(): Promise<{
          data: {
            totp: Array<{ id: string; status: 'verified' | 'unverified'; factor_type: 'totp' }>;
            all: Array<{ id: string; status: 'verified' | 'unverified'; factor_type: 'totp' | 'phone' | 'webauthn' }>;
          };
          error: AuthError | null;
        }>;
        enroll(params: { factorType: 'totp'; friendlyName?: string }): Promise<{
          data: { id: string; totp: { qr_code: string; secret: string } };
          error: AuthError | null;
        }>;
        challengeAndVerify(params: { factorId: string; code: string }): Promise<{
          data: unknown;
          error: AuthError | null;
        }>;
        unenroll(params: { factorId: string }): Promise<{
          data: unknown;
          error: AuthError | null;
        }>;
      };
    };
    from<TRecord extends object>(
      table: string
    ): QueryBuilder<TRecord>;
    rpc<TParams extends Record<string, unknown>>(
      functionName: string,
      params: TParams
    ): Promise<{ data: unknown; error: AuthError | null }>;
    storage: {
      from(bucket: string): {
        upload(
          path: string,
          file: File,
          options?: { upsert?: boolean; contentType?: string }
        ): Promise<{ data: { path: string } | null; error: AuthError | null }>;
        createSignedUrl(
          path: string,
          expiresIn: number
        ): Promise<{ data: { signedUrl: string } | null; error: AuthError | null }>;
        getPublicUrl(path: string): { data: { publicUrl: string } };
      };
    };
  };

  type CookieRecord = {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  };

  type ServerClientOptions = {
    cookies: {
      getAll(): CookieRecord[] | Promise<CookieRecord[]>;
      setAll(cookiesToSet: CookieRecord[]): void | Promise<void>;
    };
  };

  type LockFunc = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;
  type BrowserClientOptions = {
    auth?: {
      lock?: LockFunc;
      storageKey?: string;
      autoRefreshToken?: boolean;
      persistSession?: boolean;
    };
  };

  export function createBrowserClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: BrowserClientOptions
  ): SupabaseClient;

  export function createServerClient(
    supabaseUrl: string,
    supabaseKey: string,
    options: ServerClientOptions
  ): SupabaseClient;
}
