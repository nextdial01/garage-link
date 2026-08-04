import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const PROJECT_ID = 'prj_Km3mc8IAxkLNDceHMbXEHQx2WmA3';
const PROJECT_REF = 'gaytoojzwqkpuvfofeql';
const PURPOSE = 'owner-preview';
const MARKER = '[OWNER PREVIEW QA 20260804]';

export async function POST(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_PROJECT_ID !== PROJECT_ID || !host.endsWith('.vercel.app') || host === 'garage-link.tech') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const admin = createAdminClient();
  const supabase = await createClient();
  if (!admin) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const metadata = (user as typeof user & { user_metadata?: { purpose?: string } }).user_metadata;
  if (!user?.id || user.email?.toLowerCase() !== 'owner.preview.qa@gaytoojzwqkpuvfofeql.invalid' || metadata?.purpose !== PURPOSE) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const result = await admin.rpc('qa_owner_preview_reset_fixture', {
    p_environment: 'preview',
    p_project_ref: PROJECT_REF,
    p_purpose: PURPOSE,
    p_marker: MARKER,
  });
  if (result.error) return NextResponse.json({ error: 'Reset unavailable' }, { status: 503 });
  const deleted = await admin.auth.admin.deleteUser(user.id, false);
  if (deleted.error && deleted.error.status !== 404) return NextResponse.json({ error: 'Reset incomplete' }, { status: 503 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('garage_owner_preview');
  return response;
}
