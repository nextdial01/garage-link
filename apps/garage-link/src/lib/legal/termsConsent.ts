export const TERMS_VERSION = '2026-07-23' as const;

export function formatTermsVersionJa(version: string = TERMS_VERSION) {
  const [year, month, day] = version.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

export function createTermsConsentMetadata(acceptedAt: Date = new Date()) {
  return {
    terms_accepted_at: acceptedAt.toISOString(),
    terms_version: TERMS_VERSION,
  };
}
