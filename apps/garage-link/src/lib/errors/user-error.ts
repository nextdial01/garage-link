import { translateDbError } from './translate-db-error';

export function toUserErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error
    ? error.message.trim()
    : typeof error === 'string'
      ? error.trim()
      : '';

  if (!rawMessage) return fallback;

  const translated = translateDbError(rawMessage, fallback);
  if (translated !== rawMessage) return translated;

  return fallback;
}
