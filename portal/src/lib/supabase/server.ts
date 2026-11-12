import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSupabaseEnv } from "./env";

/** サーバー側（Server Component / Server Action / Route Handler）用のSupabaseクライアント */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません",
    );
  }
  // セッションの確認は必ずリクエスト時に行う（事前レンダリング・先読みの対象にしない）
  await connection();
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Componentからはcookieを書けない。セッション更新は proxy.ts が行うので無視してよい
        }
      },
    },
  });
}
