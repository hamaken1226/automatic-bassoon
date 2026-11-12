/**
 * Supabaseの接続情報。未設定なら null（設定前でも画面が落ちないようにする）
 * URLは「https://xxxx.supabase.co」の部分だけを使う。
 * 管理画面からコピーした値に「/rest/v1/」などが付いていても動くように、余分なパスは取り除く。
 */
export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;
  let url: string;
  try {
    url = new URL(rawUrl).origin;
  } catch {
    return null;
  }
  return { url, anonKey };
}
