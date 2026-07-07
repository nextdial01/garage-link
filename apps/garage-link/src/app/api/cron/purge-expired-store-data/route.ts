import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

async function purgeExpiredStoreData() {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: '管理クライアントを初期化できません。' }, { status: 503 });
  }

  const { data, error } = await admin.rpc('purge_expired_store_data');

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}

/** Vercel Cron（1日1回・GET） */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: '認可されていません。' }, { status: 401 });
  }

  return purgeExpiredStoreData();
}

/** 手動実行（POST） */
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: '認可されていません。' }, { status: 401 });
  }

  return purgeExpiredStoreData();
}
