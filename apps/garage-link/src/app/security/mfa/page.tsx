import { redirect } from 'next/navigation';

export default async function MfaPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const from = typeof params.from === 'string' ? params.from : '/dashboard';
  redirect(`/security/email-otp?from=${encodeURIComponent(from)}`);
}
