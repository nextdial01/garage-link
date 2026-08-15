import { releaseQaRunId } from '@/lib/auth/releaseQaCallback';

const AUTH_CALLBACK_PATH = '/auth/callback';
const AUTH_CONFIRM_PATH = '/auth/confirm';
const AUTH_CONFIRM_TYPES = new Set(['email', 'recovery']);
const TOKEN_HASH = /^[A-Za-z0-9_-]{20,512}$/;
const GARAGE_LINK_HOST = /(?:^|\.)garage-link\.tech$/i;

export type ControlledEmailConfirmationType = 'email' | 'recovery';

function safeRelativePath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  const parsed = new URL(value, 'https://garage-link.invalid');
  if (parsed.origin !== 'https://garage-link.invalid' || parsed.pathname !== AUTH_CALLBACK_PATH) return null;

  const next = parsed.searchParams.get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  const nextUrl = new URL(next, 'https://garage-link.invalid');
  if (nextUrl.origin !== 'https://garage-link.invalid') return null;
  if (!['/signup', '/auth/reset-password'].includes(nextUrl.pathname)) return null;
  if (nextUrl.pathname === '/signup' && nextUrl.searchParams.get('resume') !== '1') return null;

  const outerRun = releaseQaRunId(parsed.searchParams.get('qa_run'));
  const innerRun = releaseQaRunId(nextUrl.searchParams.get('qa_run'));
  if (outerRun !== innerRun) return null;

  return `${parsed.pathname}${parsed.search}`;
}

export function controlledEmailConfirmationRedirect(origin: string, callbackPath: string): string {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || !GARAGE_LINK_HOST.test(base.hostname)) {
    throw new Error('CONTROLLED_EMAIL_CONFIRM_ORIGIN_INVALID');
  }
  const next = safeRelativePath(callbackPath);
  if (!next) throw new Error('CONTROLLED_EMAIL_CONFIRM_NEXT_INVALID');
  const confirm = new URL(AUTH_CONFIRM_PATH, base.origin);
  confirm.searchParams.set('next', next);
  return confirm.toString();
}

export function controlledEmailCallbackUrl(origin: string, nextPath: string, qaRunId: string | null): URL {
  const confirmOrigin = new URL(origin);
  if (confirmOrigin.protocol !== 'https:' || !GARAGE_LINK_HOST.test(confirmOrigin.hostname)) {
    throw new Error('CONTROLLED_EMAIL_CONFIRM_ORIGIN_INVALID');
  }
  const callback = new URL(AUTH_CALLBACK_PATH, confirmOrigin);
  callback.searchParams.set('next', nextPath);
  if (qaRunId) callback.searchParams.set('qa_run', qaRunId);
  return callback;
}

export function parseControlledEmailConfirmation(input: {
  tokenHash: string | null;
  type: string | null;
  next: string | null;
}): { tokenHash: string; type: ControlledEmailConfirmationType; next: string } | null {
  if (!input.tokenHash || !TOKEN_HASH.test(input.tokenHash)) return null;
  if (!input.type || !AUTH_CONFIRM_TYPES.has(input.type)) return null;
  const next = safeRelativePath(input.next);
  if (!next) return null;

  const nextUrl = new URL(next, 'https://garage-link.invalid');
  const purpose = nextUrl.searchParams.get('next');
  if (input.type === 'email' && !purpose?.startsWith('/signup?')) return null;
  if (input.type === 'recovery' && !purpose?.startsWith('/auth/reset-password')) return null;

  return { tokenHash: input.tokenHash, type: input.type as ControlledEmailConfirmationType, next };
}

export const controlledEmailConfirmationPaths = {
  confirm: AUTH_CONFIRM_PATH,
  callback: AUTH_CALLBACK_PATH,
};
