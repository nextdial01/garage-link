import * as SecureStore from 'expo-secure-store';

// expo-secure-store accepts only alphanumeric characters plus `.`, `-`, and
// `_` in keys. Keep get/save/clear on this single native-safe key.
const TRUSTED_DEVICE_KEY = 'garage-link.trusted-device-token';

export function getTrustedDeviceToken() {
  return SecureStore.getItemAsync(TRUSTED_DEVICE_KEY).catch(() => null);
}

export function saveTrustedDeviceToken(token: string) {
  return SecureStore.setItemAsync(TRUSTED_DEVICE_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

// This is deliberately reserved for an explicit "remove trusted device"
// action. Normal sign-out only removes the Supabase session; it must not turn
// a known device into a new device.
export function clearTrustedDeviceToken() {
  return SecureStore.deleteItemAsync(TRUSTED_DEVICE_KEY);
}
