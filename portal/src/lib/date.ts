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

// ---- 日付文字列（YYYY-MM-DD）の計算。時刻やタイムゾーンの影響を受けないようUTCで扱う ----

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** b - a の日数 */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** 0=日 〜 6=土 */
export function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** その月の末日（month は 1〜12） */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「11/15（日）」。年が今年でなければ「2027/1/5（火）」 */
export function formatDateShort(date: string, today: string = todayJst()): string {
  const [y, m, d] = date.split("-").map(Number);
  const md = `${m}/${d}（${WEEKDAY_LABELS[weekdayOf(date)]}）`;
  return y === Number(today.slice(0, 4)) ? md : `${y}/${md}`;
}

/** 日時を「11/15 21:30」の形式（日本時間）で表示 */
export function formatDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year") === todayJst().slice(0, 4) ? "" : `${get("year")}/`;
  return `${year}${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

// ---- 日時（ISO文字列）と日本時間の相互変換 ----

/** 日時 → 日本時間での日付（YYYY-MM-DD） */
export function jstDateOf(iso: string): string {
  return todayJst(new Date(iso));
}

/** 日時 → <input type="datetime-local"> 用の日本時間（YYYY-MM-DDTHH:mm） */
export function toJstInput(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(" ", "T");
}

/** <input type="datetime-local"> の値（日本時間）→ 日時 */
export function fromJstInput(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}

/** 日時 → 「21:30」（日本時間） */
export function formatTime(iso: string): string {
  return toJstInput(iso).slice(11);
}

/** その日を含む週の月曜日 */
export function weekStart(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** 分 → 「1時間30分」 */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}分`;
  return m % 60 === 0 ? `${h}時間` : `${h}時間${m % 60}分`;
}
