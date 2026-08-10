/**
 * Auth UI and Supabase Auth must enforce the same minimum everywhere.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function hasMinimumPasswordLength(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH;
}
