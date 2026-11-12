import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { expandEvents } from "@/lib/calendar-parse";
import { todayJst } from "@/lib/date";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const CACHE_MS = 15 * 60 * 1000;
const DAYS = 4; // 今日〜3日後

// 取得したiCalを15分ほどサーバーのメモリに持つ（URLはブラウザに渡さない）
let cache: { at: number; text: string } | null = null;

async function fetchIcs(url: string): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("iCalの形式ではありません");
  cache = { at: Date.now(), text };
  return text;
}

/** ホームの「予定」カード用: Googleカレンダーの今日〜3日後の予定 */
export async function GET() {
  if (!getSupabaseEnv()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedEmail(user.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!url) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const today = todayJst();
    const events = expandEvents(await fetchIcs(url), today, DAYS);
    return NextResponse.json({ from: today, days: DAYS, events }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("calendar fetch failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
