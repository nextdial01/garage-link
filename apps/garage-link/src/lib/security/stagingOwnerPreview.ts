import type { NextRequest } from 'next/server';

export const STAGING_PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
export const STAGING_REF = 'gaytoojzwqkpuvfofeql';
export const PRODUCTION_REF = 'wmlpuzuskfiwdipluglz';
export const OWNER_PREVIEW_PURPOSE = 'owner-preview';
export const OWNER_PREVIEW_MARKER = '[OWNER PREVIEW QA 20260804]';
export const OWNER_PREVIEW_EMAIL = 'owner.preview.qa@gaytoojzwqkpuvfofeql.invalid';

export function isStagingOwnerPreviewRequest(request: NextRequest): boolean {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').toLowerCase();
  const vercelUrl = (process.env.VERCEL_URL ?? '').toLowerCase();
  const hostAllowed = host.endsWith('.vercel.app') && (host.startsWith('garage-link-staging-') || host === vercelUrl);
  return process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID
    && url.includes(`${STAGING_REF}.supabase.co`)
    && !url.includes(PRODUCTION_REF)
    && host !== 'garage-link.tech'
    && hostAllowed;
}
