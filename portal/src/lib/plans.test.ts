import { describe, expect, it } from "vitest";
import { pagesPerDay, planStatus, targetPage } from "./plans";

// 仕様の例: 45〜80ページ（36ページ）を 11/15〜11/20（6日間）で進める → 1日6ページ
const plan = { start_page: 45, end_page: 80, start_date: "2026-11-15", end_date: "2026-11-20" };

describe("計画の計算", () => {
  it("1日あたりのページ数", () => {
    expect(pagesPerDay(plan)).toBe(6);
  });
  it("その日の終わりまでに到達しているべきページ", () => {
    expect(targetPage(plan, "2026-11-14")).toBe(44); // 開始前
    expect(targetPage(plan, "2026-11-15")).toBe(50);
    expect(targetPage(plan, "2026-11-17")).toBe(62);
    expect(targetPage(plan, "2026-11-20")).toBe(80);
    expect(targetPage(plan, "2026-12-01")).toBe(80); // 終了後
  });
  it("割り切れないときは切り上げ、最終日に終了ページ", () => {
    const p = { start_page: 1, end_page: 10, start_date: "2026-11-01", end_date: "2026-11-03" };
    expect(targetPage(p, "2026-11-01")).toBe(4);
    expect(targetPage(p, "2026-11-02")).toBe(7);
    expect(targetPage(p, "2026-11-03")).toBe(10);
  });
  it("予定どおり / 遅れ / 先行", () => {
    const s = (actual: number, today: string, yesterday: string) => planStatus(plan, actual, today, yesterday);
    expect(s(44, "2026-11-14", "2026-11-13")).toBe("before");
    // 11/17: 昨日までの目標56、今日の目標62
    expect(s(56, "2026-11-17", "2026-11-16")).toBe("on_track"); // 今日の分はこれから
    expect(s(62, "2026-11-17", "2026-11-16")).toBe("on_track");
    expect(s(55, "2026-11-17", "2026-11-16")).toBe("behind");
    expect(s(63, "2026-11-17", "2026-11-16")).toBe("ahead");
    expect(s(80, "2026-11-17", "2026-11-16")).toBe("done");
    expect(s(70, "2026-11-25", "2026-11-24")).toBe("behind"); // 期間が終わっても未達
  });
});
