import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiUrl } from './lib/apiUrl';

// This is the PUBLISHABLE (a.k.a. "anon") key — safe to ship inside the
// app, unlike the secret/service_role key which only ever lives in the
// backend's .env file.
// Can be pointed at another Supabase project with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// (in .env next to package.json); it must be the same project as the backend's SUPABASE_URL.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lkcarrbnfgpffmixcyqx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Y51Oulvqt5JRzxAg3H8ijw_lJWHO51e';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Where the backend lives. This is worked out automatically (see
// lib/apiUrl.js): the browser uses the page's own host, a phone running Expo Go
// uses your computer's address from Expo, and EXPO_PUBLIC_API_URL in .env
// overrides everything (use it for a deployed backend or a tunnel).
const resolved = resolveApiUrl({
  env: process.env.EXPO_PUBLIC_API_URL,
  os: Platform.OS,
  location: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location : undefined,
  hostUri: Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost,
});

export const API_URL = resolved.url;
export const API_URL_SOURCE = resolved.source;
console.log(`[api] using ${API_URL} (from ${API_URL_SOURCE})`);
