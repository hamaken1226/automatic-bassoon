import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

// ログインしていなくても開けるパス
const PUBLIC_PATHS = ["/login", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAllowedEmail(email: string | null | undefined) {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

function redirectTo(request: NextRequest, pathname: string, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = error ? `?error=${error}` : "";
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = getSupabaseEnv();
  if (!env) {
    // 環境変数が未設定: ログイン画面（設定の案内を表示）だけ開ける
    return isPublic(pathname)
      ? NextResponse.next()
      : redirectTo(request, "/login", "config");
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // セッションの検証と更新（Supabaseに問い合わせて確認する）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 更新されたセッションcookieをリダイレクト応答にも引き継ぐ
  const withCookies = (res: NextResponse) => {
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  if (user && !isAllowedEmail(user.email)) {
    // 許可されていないアカウントはログアウトさせて弾く
    await supabase.auth.signOut();
    return withCookies(redirectTo(request, "/login", "forbidden"));
  }
  if (!user && !isPublic(pathname)) {
    return withCookies(redirectTo(request, "/login"));
  }
  if (user && pathname === "/login") {
    return withCookies(redirectTo(request, "/"));
  }
  return response;
}

export const config = {
  matcher: [
    {
      // 静的ファイル・PWA用ファイル以外のすべて
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:png|svg|ico|webp)$).*)",
      // リンクの先読みではSupabaseに問い合わせない（先読みで返るのは枠だけで、
      // 個人のデータは各ページがリクエスト時に本人確認してから読む）
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
