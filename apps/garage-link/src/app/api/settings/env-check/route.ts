import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
};

type EnvCheckItem = {
  name: string;
  configured: boolean;
  category: 'Supabase' | 'LINE' | 'App' | 'E2E';
  public: boolean;
};

const allowedRoles = ['owner', 'admin'];

function configured(name: string) {
  return Boolean(process.env[name]);
}

function buildEnvItems(): EnvCheckItem[] {
  return [
    {
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      configured: configured('NEXT_PUBLIC_SUPABASE_URL'),
      category: 'Supabase',
      public: true,
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      configured: configured('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      category: 'Supabase',
      public: true,
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      configured: configured('SUPABASE_SERVICE_ROLE_KEY'),
      category: 'Supabase',
      public: false,
    },
    {
      name: 'LINE_CHANNEL_SECRET',
      configured: configured('LINE_CHANNEL_SECRET'),
      category: 'LINE',
      public: false,
    },
    {
      name: 'LINE_CHANNEL_ACCESS_TOKEN',
      configured: configured('LINE_CHANNEL_ACCESS_TOKEN'),
      category: 'LINE',
      public: false,
    },
    {
      name: 'NEXT_PUBLIC_APP_URL',
      configured: configured('NEXT_PUBLIC_APP_URL'),
      category: 'App',
      public: true,
    },
    {
      name: 'E2E_TEST_EMAIL',
      configured: configured('E2E_TEST_EMAIL'),
      category: 'E2E',
      public: false,
    },
    {
      name: 'E2E_TEST_PASSWORD',
      configured: configured('E2E_TEST_PASSWORD'),
      category: 'E2E',
      public: false,
    },
  ];
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return NextResponse.json({ ok: false, error: 'ログイン情報を取得できませんでした。' }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role')
    .eq('user_id', userData.user.id)
    .single();

  if (memberError || !member?.store_id) {
    return NextResponse.json({ ok: false, error: '所属店舗を取得できませんでした。' }, { status: 403 });
  }

  if (!allowedRoles.includes(member.role ?? '')) {
    return NextResponse.json({ ok: false, error: '権限がありません' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    items: buildEnvItems(),
  });
}
