import { addDays, diffDays, lastDayOfMonth, weekdayOf, WEEKDAY_LABELS } from "./date";

export type RuleType = "daily" | "weekly" | "monthly" | "interval";

export type RecurrenceRule = {
  rule_type: RuleType;
  weekdays: number[]; // 0=日 〜 6=土
  day_of_month: number | null;
  interval_days: number | null;
};

/**
 * 定期タスクの次の期限。
 * 「繰り返しのルールに合う日のうち、前回の期限と完了日のどちらよりも後で、最も早い日」
 */
export function nextDueDate(rule: RecurrenceRule, prevDue: string, completedOn: string): string {
  const after = prevDue > completedOn ? prevDue : completedOn;

  switch (rule.rule_type) {
    case "daily":
      return addDays(after, 1);

    case "weekly": {
      const days = rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(prevDue)];
      for (let i = 1; i <= 7; i++) {
        const d = addDays(after, i);
        if (days.includes(weekdayOf(d))) return d;
      }
      return addDays(after, 7);
    }

    case "monthly": {
      const dom = rule.day_of_month ?? Number(prevDue.slice(8, 10));
      let [y, m] = after.split("-").map(Number);
      for (;;) {
        // 31日など存在しない日は月末扱い
        const day = Math.min(dom, lastDayOfMonth(y, m));
        const d = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (d > after) return d;
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }

    case "interval": {
      // 前回の期限から◯日ごとの日のうち、after より後で最も早い日
      const n = Math.max(1, rule.interval_days ?? 1);
      const k = Math.floor(diffDays(prevDue, after) / n) + 1;
      return addDays(prevDue, k * n);
    }
  }
}

/** 「毎週 月・木」のような説明文 */
export function describeRule(rule: RecurrenceRule): string {
  switch (rule.rule_type) {
    case "daily":
      return "毎日";
    case "weekly":
      return `毎週 ${[...rule.weekdays].sort().map((d) => WEEKDAY_LABELS[d]).join("・")}`;
    case "monthly":
      return `毎月 ${rule.day_of_month}日`;
    case "interval":
      return `${rule.interval_days}日ごと`;
  }
}
