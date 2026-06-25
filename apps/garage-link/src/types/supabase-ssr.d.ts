declare module '@supabase/ssr' {
  type AuthUser = {
    id: string;
    email?: string | null;
  };

  type AuthError = {
    message: string;
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
    or(filters: string): QueryBuilder<TRecord>;
    order(
      column: string,
      options?: { ascending?: boolean }
    ): QueryBuilder<TRecord>;
    range(from: number, to: number): QueryBuilder<TRecord>;
    single(): Promise<QueryResponse<TRecord>>;
    maybeSingle(): Promise<QueryResponse<TRecord>>;
  };

  type SupabaseClient = {
    auth: {
      getUser(): Promise<{
        data: { user: AuthUser | null };
        error: AuthError | null;
      }>;
      signInWithPassword(credentials: {
        email: string;
        password: string;
      }): Promise<AuthResponse>;
      signUp(credentials: {
        email: string;
        password: string;
      }): Promise<AuthResponse>;
      signOut(): Promise<{ error: AuthError | null }>;
      resetPasswordForEmail(
        email: string,
        options?: { redirectTo?: string }
      ): Promise<{ data: unknown; error: AuthError | null }>;
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
