import { addDays, lastDayOfMonth } from "./date";
import type { CollectMethod, MoneyPlace, MoneyTx, PlaceKind, TxType } from "./types";

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  bank: "口座",
  cash: "現金",
  emoney: "電子マネー",
  credit: "クレジットカード",
};

export const TX_TYPE_LABEL: Record<TxType, string> = {
  expense: "支出",
  income: "収入",
  transfer: "振替",
  adjustment: "調整",
  loan_collection: "貸しの回収",
};

export const COLLECT_METHOD_LABEL: Record<CollectMethod, string> = {
  paypay: "PayPay",
  bank: "振込",
  cash: "現金",
};

/** 「1,234円」。マイナスは「−1,234円」 */
export function formatYen(n: number): string {
  return `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString("ja-JP")}円`;
}

/** 金額の入力を整数にする。全角数字・カンマ・「円」も受け付ける。不正なら null */
export function parseAmount(value: string, allowNegative = false): number | null {
  const v = value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s円¥￥]/g, "")
    .replace(/^[−ー－]/, "-");
  if (!(allowNegative ? /^-?\d+$/ : /^\d+$/).test(v)) return null;
  return Number(v);
}

/** 置き場所から出ていく金額（まとめ払いは全額） */
export function outflow(t: Pick<MoneyTx, "amount" | "total_amount">): number {
  return t.total_amount ?? t.amount;
}

/**
 * 各置き場所の残高。クレカは「−未払い額」で持つ（資産の合計からそのまま引けるように）。
 * upTo を指定すると、その日までの記録だけで計算する。
 */
export function balances(places: MoneyPlace[], txs: MoneyTx[], upTo?: string): Map<string, number> {
  const map = new Map(places.map((p) => [p.id, p.kind === "credit" ? -p.initial_balance : p.initial_balance]));
  const add = (id: string | null, n: number) => {
    if (id && map.has(id)) map.set(id, map.get(id)! + n);
  };
  for (const t of txs) {
    if (upTo && t.date > upTo) continue;
    switch (t.type) {
      case "expense":
        add(t.place_id, -outflow(t));
        break;
      case "income":
      case "loan_collection":
      case "adjustment":
        add(t.place_id, t.amount);
        break;
      case "transfer":
        add(t.place_id, -t.amount);
        add(t.to_place_id, t.amount);
        break;
    }
  }
  return map;
}

/** 全置き場所の合計（資産 − クレカ未払い） */
export function netWorth(places: MoneyPlace[], txs: MoneyTx[], upTo?: string): number {
  return [...balances(places, txs, upTo).values()].reduce((a, b) => a + b, 0);
}

/** その月（YYYY-MM）の収入・支出・調整。支出は自分の負担分だけ。振替・貸しの回収は数えない */
export function monthTotals(txs: MoneyTx[], month: string) {
  let income = 0;
  let expense = 0;
  let adjustment = 0;
  for (const t of txs) {
    if (!t.date.startsWith(month)) continue;
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expense += t.amount;
    else if (t.type === "adjustment") adjustment += t.amount;
  }
  return { income, expense, diff: income - expense, adjustment };
}

/** その月のカテゴリ別支出（自分の負担分）。カテゴリなしは null */
export function expenseByCategory(txs: MoneyTx[], month: string): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const t of txs) {
    if (t.type !== "expense" || !t.date.startsWith(month)) continue;
    map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount);
  }
  return map;
}

/** YYYY-MM を n か月ずらす */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** today を含む直近 count か月（古い順） */
export function recentMonths(today: string, count: number): string[] {
  const current = today.slice(0, 7);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - count + 1));
}

/** その月の末日（YYYY-MM-DD） */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(lastDayOfMonth(y, m)).padStart(2, "0")}`;
}

/** その月の day 日。存在しない日は月末 */
function dayIn(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(Math.min(day, lastDayOfMonth(y, m))).padStart(2, "0")}`;
}

// ---- クレカ ----

export type CardRule = {
  closing_day: number; // 31 = 末日
  payment_day: number;
  payment_month_offset: number; // 1 = 翌月、2 = 翌々月
  check_day: number | null;
};

export type CardPeriod = {
  start: string;
  end: string; // 締め日
  due: string; // 支払日
  check: string | null; // 照合する日
};

/** 締め日が closingMonth にある期間 */
export function cardPeriod(rule: CardRule, closingMonth: string): CardPeriod {
  const end = dayIn(closingMonth, rule.closing_day);
  const start = addDays(dayIn(shiftMonth(closingMonth, -1), rule.closing_day), 1);
  const dueMonth = shiftMonth(closingMonth, rule.payment_month_offset);
  const due = dayIn(dueMonth, rule.payment_day);
  let check: string | null = null;
  if (rule.check_day) {
    // 支払日以降で最初の「照合する日」
    check = dayIn(dueMonth, rule.check_day);
    if (check < due) check = dayIn(shiftMonth(dueMonth, 1), rule.check_day);
  }
  return { start, end, due, check };
}

/** 今日を含む（まだ締まっていない）期間と、その前の count 期間（新しい順） */
export function recentCardPeriods(rule: CardRule, today: string, count: number): CardPeriod[] {
  const thisMonth = today.slice(0, 7);
  const openMonth = today <= dayIn(thisMonth, rule.closing_day) ? thisMonth : shiftMonth(thisMonth, 1);
  return Array.from({ length: count + 1 }, (_, i) => cardPeriod(rule, shiftMonth(openMonth, -i)));
}

/** そのカードで期間内に使った記録（まとめ払いは全額）と、返金（カードへの収入） */
export function cardUsages(txs: MoneyTx[], cardId: string, start: string, end: string): MoneyTx[] {
  return txs
    .filter((t) => t.place_id === cardId && (t.type === "expense" || t.type === "income") && t.date >= start && t.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}

/** アプリ上の請求額 */
export function cardAppAmount(txs: MoneyTx[], cardId: string, start: string, end: string): number {
  return cardUsages(txs, cardId, start, end).reduce((sum, t) => sum + (t.type === "expense" ? outflow(t) : -t.amount), 0);
}

// ---- まとめ払い ----

/** 自分の負担分＋貸しの合計＝全額 になっているか。問題があればメッセージを返す */
export function splitError(total: number, share: number, loans: { person: string; amount: number }[]): string | null {
  if (loans.length === 0) return "貸した相手を1人以上入力してください";
  if (loans.some((l) => !l.person.trim())) return "貸した相手の名前を入力してください";
  if (loans.some((l) => !(l.amount > 0))) return "貸した金額を入力してください";
  const lent = loans.reduce((sum, l) => sum + l.amount, 0);
  if (share + lent !== total) {
    return `自分の負担分（${formatYen(share)}）＋貸し（${formatYen(lent)}）が全額（${formatYen(total)}）と合いません（差: ${formatYen(total - share - lent)}）`;
  }
  return null;
}
