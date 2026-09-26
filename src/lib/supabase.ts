import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

// Don't throw on missing keys at module load time — that kills session
// restoration before AsyncStorage has a chance to rehydrate.
// The first real API call will fail with a clear auth error instead.
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing. ' +
    'Copy .env.example to .env and fill in your keys.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,       // persists session across cold starts
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,   // not a web app
  },
});
