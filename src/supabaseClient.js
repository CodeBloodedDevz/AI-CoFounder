import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// This is the PUBLISHABLE (a.k.a. "anon") key — safe to ship inside the
// app, unlike the secret/service_role key which only ever lives in the
// backend's .env file.
const SUPABASE_URL = 'https://lkcarrbnfgpffmixcyqx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Y51Oulvqt5JRzxAg3H8ijw_lJWHO51e';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// IMPORTANT: this must be a full URL — "http://" AND the port are both
// required. A bare IP address is NOT a valid URL and every fetch() call
// using it will silently fail.
//
// Testing on EXPO WEB (browser on the same laptop as the backend):
//   use http://localhost:4000  <-- this is what's set below right now
//
// Testing on a REAL PHONE via Expo Go:
//   "localhost" means the PHONE itself, so it won't work — you need your
//   computer's local network IP instead (run `ipconfig`, look for "IPv4
//   Address"), e.g. http://192.168.1.42:4000, with phone + laptop on the
//   SAME network (a shared hotspot works, but Windows Firewall may need
//   that network set to "Private" — see the earlier troubleshooting notes).
export const API_URL = 'http://localhost:4000';
