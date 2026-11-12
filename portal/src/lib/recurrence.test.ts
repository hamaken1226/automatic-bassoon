import { describe, expect, it } from "vitest";
import { nextDueDate, type RecurrenceRule } from "./recurrence";

const rule = (r: Partial<RecurrenceRule>): RecurrenceRule => ({
  rule_type: "daily",
  weekdays: [],
  day_of_month: null,
  interval_days: null,
  ...r,
});

describe("nextDueDate", () => {
  it("毎日: 期限どおりに完了したら翌日", () => {
    expect(nextDueDate(rule({}), "2026-11-12", "2026-11-12")).toBe("2026-11-13");
  });
  it("毎日: サボって遅れて完了しても溜まらず、完了日の翌日", () => {
    expect(nextDueDate(rule({}), "2026-11-01", "2026-11-12")).toBe("2026-11-13");
  });
  it("毎日: 前倒しで完了したら期限の翌日", () => {
    expect(nextDueDate(rule({}), "2026-11-15", "2026-11-12")).toBe("2026-11-16");
  });

  // 2026-11-12 は木曜
  const monThu = rule({ rule_type: "weekly", weekdays: [1, 4] });
  it("毎週（月・木）: 木曜に完了したら次の月曜", () => {
    expect(nextDueDate(monThu, "2026-11-12", "2026-11-12")).toBe("2026-11-16");
  });
  it("毎週（月・木）: 月曜分を水曜に完了したら木曜", () => {
    expect(nextDueDate(monThu, "2026-11-09", "2026-11-11")).toBe("2026-11-12");
  });
  it("毎週（木のみ）: 当日完了なら1週間後", () => {
    expect(nextDueDate(rule({ rule_type: "weekly", weekdays: [4] }), "2026-11-12", "2026-11-12")).toBe("2026-11-19");
  });

  const m31 = rule({ rule_type: "monthly", day_of_month: 31 });
  it("毎月31日: 30日までの月は月末扱い", () => {
    expect(nextDueDate(m31, "2026-10-31", "2026-10-31")).toBe("2026-11-30");
  });
  it("毎月31日: 2月は28日（うるう年は29日）", () => {
    expect(nextDueDate(m31, "2027-01-31", "2027-01-31")).toBe("2027-02-28");
    expect(nextDueDate(m31, "2028-01-31", "2028-01-31")).toBe("2028-02-29");
  });
  it("毎月31日: 月末扱いの月から次の月へ", () => {
    expect(nextDueDate(m31, "2026-11-30", "2026-11-30")).toBe("2026-12-31");
  });
  it("毎月1日: 何か月も遅れて完了しても次は直近の1日だけ", () => {
    expect(nextDueDate(rule({ rule_type: "monthly", day_of_month: 1 }), "2026-08-01", "2026-11-12")).toBe("2026-12-01");
  });
  it("毎月15日: 同じ月の15日より前に完了したら当月15日", () => {
    expect(nextDueDate(rule({ rule_type: "monthly", day_of_month: 15 }), "2026-10-15", "2026-11-03")).toBe("2026-11-15");
  });
  it("毎月: 年をまたぐ", () => {
    expect(nextDueDate(rule({ rule_type: "monthly", day_of_month: 10 }), "2026-12-10", "2026-12-10")).toBe("2027-01-10");
  });

  const every3 = rule({ rule_type: "interval", interval_days: 3 });
  it("3日ごと: 期限どおりなら3日後", () => {
    expect(nextDueDate(every3, "2026-11-12", "2026-11-12")).toBe("2026-11-15");
  });
  it("3日ごと: 遅れて完了したら、元の周期に合う日のうち完了日より後で最も早い日", () => {
    // 期限 11/1 → 周期は 11/4, 11/7, 11/10, 11/13…。11/12 に完了 → 11/13
    expect(nextDueDate(every3, "2026-11-01", "2026-11-12")).toBe("2026-11-13");
    // 周期の日ちょうどに完了したら、その次
    expect(nextDueDate(every3, "2026-11-01", "2026-11-10")).toBe("2026-11-13");
  });
  it("3日ごと: 前倒しで完了したら期限の3日後", () => {
    expect(nextDueDate(every3, "2026-11-12", "2026-11-10")).toBe("2026-11-15");
  });
});
