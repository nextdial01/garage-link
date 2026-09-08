export type AuthSessionLike = { access_token: string };

export function sessionAfterAuthEvent<T extends AuthSessionLike>(
  current: T | null,
  event: string,
  next: T | null,
) {
  return event === 'SIGNED_OUT' ? null : next ?? current;
}

export function shouldRefreshForAppState(nextAppState: string) {
  return nextAppState === 'active';
}

export const localSignOutScope = { scope: 'local' } as const;
