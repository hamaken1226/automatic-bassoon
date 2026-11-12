import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

let client: SupabaseClient | undefined;

/** ブラウザ側（Client Component）用のSupabaseクライアント。1つを使い回す */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = getSupabaseEnv();
    if (!env) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません",
      );
    }
    client = createBrowserClient(env.url, env.anonKey);
  }
  return client;
}
