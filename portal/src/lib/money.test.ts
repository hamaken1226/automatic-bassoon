import { describe, expect, it } from "vitest";
import {
  balances,
  cardAppAmount,
  cardPeriod,
  formatYen,
  monthTotals,
  netWorth,
  parseAmount,
  recentCardPeriods,
  recentMonths,
  shiftMonth,
  splitError,
} from "./money";
import type { MoneyPlace, MoneyTx } from "./types";

const base = { user_id: "u", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const place = (id: string, kind: MoneyPlace["kind"], initial = 0): MoneyPlace => ({ ...base, id, name: id, kind, initial_balance: initial, sort_order: 0 });
let n = 0;
const tx = (t: Partial<MoneyTx> & Pick<MoneyTx, "type" | "amount" | "place_id">): MoneyTx => ({
  ...base,
  id: `t${n++}`,
  date: "2026-11-10",
  total_amount: null,
  to_place_id: null,
  category_id: null,
  memo: "",
  is_suica_charge: false,
  ...t,
});

const places = [place("bank", "bank", 100_000), place("save", "bank", 500_000), place("cash", "cash", 10_000), place("card", "credit", 20_000)];

describe("残高", () => {
  const txs = [
    tx({ type: "income", amount: 250_000, place_id: "bank" }),
    tx({ type: "expense", amount: 1_000, place_id: "cash" }),
    // まとめ払い: 全額6,000円をカードで払い、自分の負担は2,000円
    tx({ type: "expense", amount: 2_000, total_amount: 6_000, place_id: "card" }),
    tx({ type: "transfer", amount: 50_000, place_id: "bank", to_place_id: "save" }),
    // カードの引き落とし
    tx({ type: "transfer", amount: 20_000, place_id: "bank", to_place_id: "card" }),
    // 貸しの回収（現金で4,000円）
    tx({ type: "loan_collection", amount: 4_000, place_id: "cash" }),
    tx({ type: "adjustment", amount: -300, place_id: "cash" }),
    tx({ type: "expense", amount: 9_999, place_id: "bank", date: "2026-12-01" }),
  ];
  it("置き場所ごと（クレカは −未払い額）", () => {
    const b = balances(places, txs, "2026-11-30");
    expect(b.get("bank")).toBe(100_000 + 250_000 - 50_000 - 20_000);
    expect(b.get("save")).toBe(550_000);
    expect(b.get("cash")).toBe(10_000 - 1_000 + 4_000 - 300);
    expect(b.get("card")).toBe(-(20_000 + 6_000 - 20_000)); // 未払い6,000円
  });
  it("日付で区切る", () => {
    expect(balances(places, txs).get("bank")).toBe(280_000 - 9_999);
  });
  it("合計（資産 − クレカ未払い）", () => {
    expect(netWorth(places, txs, "2026-11-30")).toBe(280_000 + 550_000 + 12_700 - 6_000);
  });
  it("月の収支: 支出は自分の負担分だけ、振替・回収は数えない、調整は別", () => {
    expect(monthTotals(txs, "2026-11")).toEqual({ income: 250_000, expense: 3_000, diff: 247_000, adjustment: -300 });
  });
});

describe("クレカの期間", () => {
  const rakuten = { closing_day: 31, payment_day: 27, payment_month_offset: 1, check_day: 1 };
  const saison = { closing_day: 10, payment_day: 4, payment_month_offset: 1, check_day: 8 };
  it("楽天（月末締め・翌月27日払い・1日に照合）", () => {
    expect(cardPeriod(rakuten, "2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31", due: "2026-11-27", check: "2026-12-01" });
    expect(cardPeriod(rakuten, "2027-02")).toEqual({ start: "2027-02-01", end: "2027-02-28", due: "2027-03-27", check: "2027-04-01" });
  });
  it("セゾン（10日締め・翌月4日払い・8日に照合）", () => {
    expect(cardPeriod(saison, "2026-11")).toEqual({ start: "2026-10-11", end: "2026-11-10", due: "2026-12-04", check: "2026-12-08" });
  });
  it("翌々月払い", () => {
    expect(cardPeriod({ ...saison, payment_month_offset: 2 }, "2026-11").due).toBe("2027-01-04");
  });
  it("今日を含む期間から新しい順", () => {
    expect(recentCardPeriods(saison, "2026-11-12", 1).map((p) => p.end)).toEqual(["2026-12-10", "2026-11-10"]);
    expect(recentCardPeriods(saison, "2026-11-10", 0).map((p) => p.end)).toEqual(["2026-11-10"]);
    expect(recentCardPeriods(rakuten, "2026-12-31", 0).map((p) => p.end)).toEqual(["2026-12-31"]);
  });
  it("アプリ上の請求額: まとめ払いは全額、返金は引く、振替は含めない", () => {
    const txs = [
      tx({ type: "expense", amount: 1_000, place_id: "card", date: "2026-10-11" }),
      tx({ type: "expense", amount: 2_000, total_amount: 6_000, place_id: "card", date: "2026-11-10" }),
      tx({ type: "income", amount: 500, place_id: "card", date: "2026-11-01" }),
      tx({ type: "expense", amount: 700, place_id: "card", date: "2026-11-11" }),
      tx({ type: "transfer", amount: 9_000, place_id: "bank", to_place_id: "card", date: "2026-11-04" }),
    ];
    expect(cardAppAmount(txs, "card", "2026-10-11", "2026-11-10")).toBe(1_000 + 6_000 - 500);
  });
});

describe("入力と表示", () => {
  it("金額の入力", () => {
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("１２３４円")).toBe(1234);
    expect(parseAmount("-500")).toBeNull();
    expect(parseAmount("−500", true)).toBe(-500);
    expect(parseAmount("12.5")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
  it("金額の表示", () => {
    expect(formatYen(1234567)).toBe("1,234,567円");
    expect(formatYen(-300)).toBe("−300円");
  });
  it("月の計算", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(recentMonths("2026-02-15", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("まとめ払いの合計チェック", () => {
    expect(splitError(6000, 2000, [{ person: "A", amount: 2000 }, { person: "B", amount: 2000 }])).toBeNull();
    expect(splitError(6000, 2000, [{ person: "A", amount: 2000 }])).toContain("合いません");
    expect(splitError(6000, 6000, [])).toContain("1人以上");
    expect(splitError(6000, 4000, [{ person: " ", amount: 2000 }])).toContain("名前");
  });
});
