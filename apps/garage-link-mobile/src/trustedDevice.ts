import * as SecureStore from 'expo-secure-store';

// expo-secure-store accepts only alphanumeric characters plus `.`, `-`, and
// `_` in keys. Keep get/save/clear on this single native-safe key.
const TRUSTED_DEVICE_KEY = 'garage-link.trusted-device-token';
const trustedDeviceTokenPattern = /^[0-9a-f]{64}$/i;

export type TrustedDeviceStorageErrorCode =
  | 'trusted_device_save_failed'
  | 'trusted_device_readback_failed'
  | 'trusted_device_read_failed'
  | 'trusted_device_token_invalid'
  | 'trusted_device_clear_failed';

export class TrustedDeviceStorageError extends Error {
  constructor(readonly code: TrustedDeviceStorageErrorCode) {
    super(code);
    this.name = 'TrustedDeviceStorageError';
  }
}

export async function getTrustedDeviceToken() {
  let token: string | null;
  try {
    token = await SecureStore.getItemAsync(TRUSTED_DEVICE_KEY);
  } catch {
    throw new TrustedDeviceStorageError('trusted_device_read_failed');
  }
  if (token === null) return null;
  if (!trustedDeviceTokenPattern.test(token))
    throw new TrustedDeviceStorageError('trusted_device_token_invalid');
  return token;
}

export async function saveTrustedDeviceToken(token: string) {
  if (!trustedDeviceTokenPattern.test(token))
    throw new TrustedDeviceStorageError('trusted_device_save_failed');
  try {
    await SecureStore.setItemAsync(TRUSTED_DEVICE_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    throw new TrustedDeviceStorageError('trusted_device_save_failed');
  }

  let persisted: string | null;
  try {
    persisted = await SecureStore.getItemAsync(TRUSTED_DEVICE_KEY);
  } catch {
    throw new TrustedDeviceStorageError('trusted_device_readback_failed');
  }
  if (persisted !== token)
    throw new TrustedDeviceStorageError('trusted_device_readback_failed');
}

// This is deliberately reserved for an explicit "remove trusted device"
// action. Normal sign-out only removes the Supabase session; it must not turn
// a known device into a new device.
export function clearTrustedDeviceToken() {
  return SecureStore.deleteItemAsync(TRUSTED_DEVICE_KEY).catch(() => {
    throw new TrustedDeviceStorageError('trusted_device_clear_failed');
  });
}
