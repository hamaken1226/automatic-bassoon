import { addDays, jstDateOf, weekStart } from "./date";

export type TimeRecord = { started_at: string; ended_at: string | null };

/** 記録の長さ（分）。記録中のものは 0 */
export function durationMinutes(r: TimeRecord): number {
  if (!r.ended_at) return 0;
  return Math.max(0, (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 60_000);
}

/** 記録が属する日。日をまたいだ記録は開始日の分として数える（日本時間） */
export function dayOf(r: TimeRecord): string {
  return jstDateOf(r.started_at);
}

/** 日ごとの合計（分） */
export function minutesByDay(records: TimeRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    if (!r.ended_at) continue;
    const day = dayOf(r);
    map.set(day, (map.get(day) ?? 0) + durationMinutes(r));
  }
  return map;
}

/**
 * 連続記録日数。今日の記録がまだ無くても、昨日まで続いていれば途切れた扱いにしない。
 */
export function streak(days: Set<string>, today: string): number {
  let day = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

/** from 〜 to（両端を含む）の合計（分） */
export function minutesBetween(byDay: Map<string, number>, from: string, to: string): number {
  let total = 0;
  for (const [day, minutes] of byDay) if (day >= from && day <= to) total += minutes;
  return total;
}

export type Unit = "day" | "week" | "month";

/** 日・週（月曜始まり）・月ごとの区切りのキー */
export function bucketKey(day: string, unit: Unit): string {
  if (unit === "day") return day;
  if (unit === "week") return weekStart(day);
  return day.slice(0, 7);
}

/** today を含む直近 count 個の区切りのキー（古い順） */
export function recentBuckets(today: string, unit: Unit, count: number): string[] {
  const keys: string[] = [];
  if (unit === "month") {
    let [y, m] = today.split("-").map(Number);
    for (let i = 0; i < count; i++) {
      keys.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return keys;
  }
  const step = unit === "week" ? 7 : 1;
  const last = bucketKey(today, unit);
  for (let i = count - 1; i >= 0; i--) keys.push(addDays(last, -i * step));
  return keys;
}

/** 区切りのキー → グラフの軸ラベル */
export function bucketLabel(key: string, unit: Unit): string {
  if (unit === "month") return `${Number(key.slice(5, 7))}月`;
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

/** 今週・先週・今月・先月の範囲 */
export function periods(today: string) {
  const thisWeek = weekStart(today);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(thisMonth, -1);
  return {
    thisWeek: [thisWeek, addDays(thisWeek, 6)] as const,
    lastWeek: [addDays(thisWeek, -7), addDays(thisWeek, -1)] as const,
    thisMonth: [thisMonth, `${today.slice(0, 7)}-31`] as const,
    lastMonth: [`${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd] as const,
  };
}
