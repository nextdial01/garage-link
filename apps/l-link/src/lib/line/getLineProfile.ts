import 'server-only';

export type LineProfile = {
  displayName?: string;
  pictureUrl?: string;
  statusMessage?: string;
  language?: string;
};

export async function getLineProfile({
  channelAccessToken,
  lineUserId,
}: {
  channelAccessToken: string | null | undefined;
  lineUserId: string;
}): Promise<{ profile: LineProfile | null; error: string | null }> {
  if (!channelAccessToken) {
    return { profile: null, error: 'channel_access_token_missing' };
  }

  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { profile: null, error: `profile_fetch_failed_${response.status}` };
    }

    const json = (await response.json()) as LineProfile;

    return {
      profile: {
        displayName: json.displayName,
        pictureUrl: json.pictureUrl,
        statusMessage: json.statusMessage,
        language: json.language,
      },
      error: null,
    };
  } catch {
    return { profile: null, error: 'profile_fetch_failed' };
  }
}
