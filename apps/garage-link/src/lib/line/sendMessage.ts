import { createClient as createServiceClient } from '@supabase/supabase-js';
import { decryptSecret } from '@/lib/security/encryption';

type LineSettingsTokenRow = {
  channel_access_token: string | null;
  channel_access_token_encrypted: string | null;
};

export function createLineServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  if (!serviceRoleKey || !supabaseUrl) {
    return null;
  }

  return createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getLineChannelAccessToken(storeId: string) {
  const service = createLineServiceClient();

  if (!service) {
    return {
      token: '',
      errorType: 'missing' as const,
      message: 'サーバー側のLINE送信設定が未設定です。',
    };
  }

  const { data } = await service
    .from('line_settings')
    .select('channel_access_token, channel_access_token_encrypted')
    .eq('store_id', storeId)
    .single();

  const settings = data as LineSettingsTokenRow | null;

  if (settings?.channel_access_token_encrypted) {
    try {
      return {
        token: decryptSecret(settings.channel_access_token_encrypted),
        errorType: null,
        message: null,
      };
    } catch {
      return {
        token: '',
        errorType: 'decrypt_failed' as const,
        message: 'LINE Channel Access Token の復号に失敗しました。管理者に確認してください。',
      };
    }
  }

  const token = settings?.channel_access_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

  return {
    token,
    errorType: token ? null : ('missing' as const),
    message: token ? null : 'LINE Channel Access Token が未設定です。',
  };
}

export async function sendLineTextMessage({
  channelAccessToken,
  to,
  text,
}: {
  channelAccessToken: string;
  to: string;
  text: string;
}) {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      messages: [
        {
          type: 'text',
          text,
        },
      ],
    }),
  });

  const textResponse = await response.text();
  const lineResponse = textResponse ? JSON.parse(textResponse) : { status: response.status };

  return {
    ok: response.ok,
    status: response.status,
    lineResponse,
  };
}
