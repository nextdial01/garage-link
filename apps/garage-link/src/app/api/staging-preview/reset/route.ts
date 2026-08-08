import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isStagingOwnerPreviewRequest, OWNER_PREVIEW_EMAIL, OWNER_PREVIEW_MARKER, OWNER_PREVIEW_PURPOSE, STAGING_REF } from '@/lib/security/stagingOwnerPreview';

export async function POST(request: NextRequest) {
  if (!isStagingOwnerPreviewRequest(request)) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const admin = createAdminClient();
  const supabase = await createClient();
  if (!admin) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const metadata = (user as typeof user & { user_metadata?: { purpose?: string; marker?: string } }).user_metadata;
  if (!user?.id || user.email?.toLowerCase() !== OWNER_PREVIEW_EMAIL || metadata?.purpose !== OWNER_PREVIEW_PURPOSE || metadata?.marker !== OWNER_PREVIEW_MARKER) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const result = await admin.rpc('qa_owner_preview_reset_fixture', {
    p_environment: 'preview',
    p_project_ref: STAGING_REF,
    p_purpose: OWNER_PREVIEW_PURPOSE,
    p_marker: OWNER_PREVIEW_MARKER,
  });
  if (result.error) return NextResponse.json({ error: 'Reset unavailable' }, { status: 503 });
  const deleted = await admin.auth.admin.deleteUser(user.id, false);
  if (deleted.error && deleted.error.status !== 404) return NextResponse.json({ error: 'Reset incomplete' }, { status: 503 });
  const remaining = await admin.auth.admin.getUserById(user.id);
  if (remaining.data.user || (remaining.error && remaining.error.status !== 404)) return NextResponse.json({ error: 'Reset incomplete' }, { status: 503 });
  const trusted = await admin.from('admin_trusted_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  const challenges = await admin.from('admin_email_otp_challenges').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  if (trusted.error || challenges.error || (trusted.count ?? 0) !== 0 || (challenges.count ?? 0) !== 0) return NextResponse.json({ error: 'Reset incomplete' }, { status: 503 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('garage_admin_email_verified');
  response.cookies.delete('garage_owner_preview');
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) response.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
  }
  return response;
}
