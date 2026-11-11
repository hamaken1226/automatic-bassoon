import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/** ALLOWED_EMAIL と一致するメールだけ許可する。未設定のときは全員拒否 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

/** ログイン中の本人を返す。未ログイン・許可外なら /login へ */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedEmail(user.email)) redirect("/login");
  return user;
}
