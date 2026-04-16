import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client configured for Realtime subscriptions.
 * Auth is handled separately via `client.realtime.setAuth(clerkJWT)`.
 * Returns null if env vars are missing (e.g. local dev without Supabase).
 */
export function getRealtimeClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _client;
}
