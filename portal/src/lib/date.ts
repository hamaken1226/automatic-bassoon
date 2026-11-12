/** 日付の区切りはすべて日本時間 */
export const TIME_ZONE = "Asia/Tokyo";

/** 日本時間での今日の日付（YYYY-MM-DD） */
export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(now);
}

/** 「2026年11月11日（水）」の形式 */
export function formatJstDateLong(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}年${get("month")}月${get("day")}日（${get("weekday")}）`;
}
