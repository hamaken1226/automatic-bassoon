import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** メールのリンクを開いたときの着地点。セッションを作ってホームへ送る */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const fail = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, request.url));

  if (!getSupabaseEnv()) return fail("config");
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }
  if (!ok) return fail("link");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    return fail("forbidden");
  }
  return NextResponse.redirect(new URL("/", request.url));
}
