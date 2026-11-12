import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import { expandEvents, sortEvents, splitCalendarUrls, type CalendarEvent } from "@/lib/calendar-parse";
import { todayJst } from "@/lib/date";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const CACHE_MS = 15 * 60 * 1000;
const DAYS = 4; // 今日〜3日後

// 取得したiCalをURLごとに15分ほどサーバーのメモリに持つ（URLはブラウザに渡さない）
const cache = new Map<string, { at: number; text: string }>();

async function fetchIcs(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("iCalの形式ではありません");
  cache.set(url, { at: Date.now(), text });
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

  // 複数のカレンダーは、URLを改行かカンマで区切って並べる
  const urls = splitCalendarUrls(process.env.GOOGLE_CALENDAR_ICAL_URL);
  if (urls.length === 0) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const today = todayJst();
  const results = await Promise.allSettled(urls.map(async (url) => expandEvents(await fetchIcs(url), today, DAYS)));
  const events: CalendarEvent[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") events.push(...r.value);
    else {
      failed++;
      console.error("calendar fetch failed", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
  // すべて失敗したときだけエラー。一部だけなら読めた分を返す
  if (failed === urls.length) return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  return NextResponse.json(
    { from: today, days: DAYS, events: sortEvents(events), calendars: urls.length, failed },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
