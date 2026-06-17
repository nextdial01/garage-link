export type LineSettingsFields = {
  accountId: string;
  accountName: string;
  channelId: string;
  basicId: string;
  lineBotUserId: string;
  webhookUrl: string;
};

export type LineSettingsSecrets = {
  channelSecretConfigured: boolean;
  channelAccessTokenConfigured: boolean;
};

export type LineSettingsState = {
  status: "idle" | "success" | "error";
  message: string;
  fields: LineSettingsFields;
  secrets: LineSettingsSecrets;
  connectionStatus: string;
  isConnected: boolean;
  verifiedAt: string | null;
  lastConnectionError: string | null;
};
