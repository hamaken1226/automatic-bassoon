import { cardAppAmount, recentCardPeriods, type CardPeriod } from "@/lib/money";
import type { CardSetting, CardStatement, MoneyTx } from "@/lib/types";

export type PeriodStatus = "open" | "unchecked" | "matched" | "mismatched";

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  open: "利用中",
  unchecked: "未照合",
  matched: "一致",
  mismatched: "不一致",
};

export type PeriodInfo = CardPeriod & {
  appAmount: number;
  statement: CardStatement | null;
  status: PeriodStatus;
};

/** カードの期間ごとの状態。照合済みでも、あとで記録が変わってアプリ上の金額がずれたら「不一致」にする */
export function cardPeriodInfos(setting: CardSetting, statements: CardStatement[], txs: MoneyTx[], today: string, count: number): PeriodInfo[] {
  return recentCardPeriods(setting, today, count).map((p) => {
    const appAmount = cardAppAmount(txs, setting.place_id, p.start, p.end);
    const statement = statements.find((s) => s.place_id === setting.place_id && s.period_end === p.end) ?? null;
    let status: PeriodStatus;
    if (p.end >= today) status = "open";
    else if (statement?.actual_amount == null) status = "unchecked";
    else status = statement.actual_amount === appAmount ? "matched" : "mismatched";
    return { ...p, appAmount, statement, status };
  });
}

/** 次の支払日（今日以降で最も近い、締まった期間の支払日） */
export function nextPayment(infos: PeriodInfo[], today: string): PeriodInfo | null {
  return (
    infos
      .filter((i) => i.status !== "open" && i.due >= today)
      .sort((a, b) => a.due.localeCompare(b.due))[0] ?? null
  );
}
