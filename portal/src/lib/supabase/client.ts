import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/** ブラウザ側（Client Component）用のSupabaseクライアント */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません",
    );
  }
  return createBrowserClient(env.url, env.anonKey);
}
