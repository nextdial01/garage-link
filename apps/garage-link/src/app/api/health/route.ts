import { createClient } from '@supabase/supabase-js';

// 本番で外部公開して問題ない最小ヘルスチェックです。
// Secretや設定値は返さず、DB接続のみ軽量に確認します。
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  // RLSや列権限に左右されない接続確認のため service role を優先。なければ公開anon keyを使う。
  // どちらのキーもレスポンスには含めない。
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !key) {
    console.error('[garage-link:error]', JSON.stringify({ service: 'garage-link', code: 'config_missing', route: '/api/health' }));
    return Response.json({ ok: false, service: 'garage-link', code: 'config_missing' }, { status: 503 });
  }

  try {
    const supabase = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 行データは取得せず、件数ヘッダのみの軽量クエリで接続を確認する。
    const { error } = await supabase
      .from('stores')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    if (error) {
      console.error('[garage-link:error]', JSON.stringify({ service: 'garage-link', code: 'db_unavailable', route: '/api/health' }));
      return Response.json({ ok: false, service: 'garage-link', code: 'db_unavailable' }, { status: 503 });
    }

    return Response.json({ ok: true, service: 'garage-link' });
  } catch {
    console.error('[garage-link:error]', JSON.stringify({ service: 'garage-link', code: 'db_unavailable', route: '/api/health' }));
    return Response.json({ ok: false, service: 'garage-link', code: 'db_unavailable' }, { status: 503 });
  }
}
