import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const mobileConfigurationError = !url || !anonKey
  ? 'アプリの接続設定を確認できません。管理者へお問い合わせください。'
  : null;

export const supabase = createClient(url || 'https://invalid.local', anonKey || 'invalid', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
