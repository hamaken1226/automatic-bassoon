import { describe, expect, it } from "vitest";
import { bucketKey, dayOf, durationMinutes, minutesBetween, minutesByDay, periods, recentBuckets, streak } from "./attendance";
import { formatMinutes, fromJstInput, toJstInput, weekStart } from "./date";

const rec = (start: string, end: string | null) => ({
  started_at: fromJstInput(start),
  ended_at: end ? fromJstInput(end) : null,
});

describe("勤怠の集計", () => {
  it("日本時間の入力値と相互変換できる", () => {
    expect(fromJstInput("2026-11-12T09:00")).toBe("2026-11-12T00:00:00.000Z");
    expect(toJstInput("2026-11-12T00:00:00.000Z")).toBe("2026-11-12T09:00");
  });
  it("日をまたいだ記録は開始日の分", () => {
    const r = rec("2026-11-12T23:00", "2026-11-13T01:30");
    expect(dayOf(r)).toBe("2026-11-12");
    expect(durationMinutes(r)).toBe(150);
    expect(minutesByDay([r]).get("2026-11-12")).toBe(150);
  });
  it("日本時間の深夜0時台はその日の分（UTCでは前日）", () => {
    expect(dayOf(rec("2026-11-12T00:30", "2026-11-12T01:00"))).toBe("2026-11-12");
  });
  it("記録中のものは合計に入れない", () => {
    expect(minutesByDay([rec("2026-11-12T10:00", null)]).size).toBe(0);
  });
  it("連続記録日数", () => {
    const days = new Set(["2026-11-12", "2026-11-11", "2026-11-10", "2026-11-08"]);
    expect(streak(days, "2026-11-12")).toBe(3);
    expect(streak(days, "2026-11-13")).toBe(3); // 今日まだ記録が無くても途切れない
    expect(streak(days, "2026-11-14")).toBe(0); // 丸1日空いたら途切れる
    expect(streak(new Set(), "2026-11-12")).toBe(0);
  });
  it("週は月曜始まり", () => {
    expect(weekStart("2026-11-12")).toBe("2026-11-09"); // 木 → 月
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // 日 → 同じ週の月
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });
  it("今週・先週・今月・先月の合計", () => {
    const byDay = new Map([
      ["2026-11-12", 60], // 今週・今月
      ["2026-11-09", 30], // 今週・今月
      ["2026-11-08", 20], // 先週・今月
      ["2026-10-31", 10], // 先月
      ["2026-11-30", 5], // 今月
    ]);
    const p = periods("2026-11-12");
    expect(minutesBetween(byDay, ...p.thisWeek)).toBe(90);
    expect(minutesBetween(byDay, ...p.lastWeek)).toBe(20);
    expect(minutesBetween(byDay, ...p.thisMonth)).toBe(115);
    expect(minutesBetween(byDay, ...p.lastMonth)).toBe(10);
  });
  it("先月の範囲は年をまたげる", () => {
    expect(periods("2027-01-05").lastMonth).toEqual(["2026-12-01", "2026-12-31"]);
  });
  it("グラフの区切り", () => {
    expect(recentBuckets("2026-11-12", "day", 3)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(recentBuckets("2026-11-12", "week", 2)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(recentBuckets("2027-01-12", "month", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(bucketKey("2026-11-12", "week")).toBe("2026-11-09");
    expect(bucketKey("2026-11-12", "month")).toBe("2026-11");
  });
  it("時間の表示", () => {
    expect(formatMinutes(45)).toBe("45分");
    expect(formatMinutes(60)).toBe("1時間");
    expect(formatMinutes(90.4)).toBe("1時間30分");
  });
});
