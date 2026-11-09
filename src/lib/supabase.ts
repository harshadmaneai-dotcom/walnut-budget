import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** True when both backend variables are present. Without them there is no auth and no sync. */
export const backendConfigured = Boolean(url && key);

/** One client for auth and data. Sessions persist in localStorage and survive reloads. */
export const supabase: SupabaseClient | null = backendConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
