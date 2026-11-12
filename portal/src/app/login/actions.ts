"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "email" | "code";
  email: string;
  error?: string;
};

const CONFIG_ERROR = "Supabaseの環境変数が設定されていません";

/** ログイン用メール（マジックリンク）を送る */
export async function sendLoginEmail(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // 「入力し直す」: 最初の画面に戻すだけ
  if (formData.get("reset")) return { step: "email", email: "" };
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { step: "email", email, error: "メールアドレスを入力してください" };
  if (!getSupabaseEnv()) return { step: "email", email, error: CONFIG_ERROR };
  if (!isAllowedEmail(email)) {
    return { step: "email", email, error: "このメールアドレスではログインできません" };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: origin ? `${origin}/auth/callback` : undefined },
  });
  if (error) {
    return {
      step: "email",
      email,
      error: `メールを送信できませんでした（${error.message}）`,
    };
  }
  return { step: "code", email };
}

/** メールに書かれたコードでログインする（リンクを開けないとき用） */
export async function verifyLoginCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!token) return { step: "code", email, error: "コードを入力してください" };
  if (!getSupabaseEnv()) return { step: "code", email, error: CONFIG_ERROR };
  if (!isAllowedEmail(email)) {
    return { step: "email", email, error: "このメールアドレスではログインできません" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !isAllowedEmail(data.user?.email)) {
    if (!error) await supabase.auth.signOut();
    return {
      step: "code",
      email,
      error: "コードが正しくないか、期限が切れています",
    };
  }
  redirect("/");
}

export async function signOut() {
  if (getSupabaseEnv()) {
    const supabase = await createClient();
    // この端末だけログアウトする（PCとスマホの片方を残せるように）
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/login");
}
