import { diffDays } from "./date";

export type PlanSpan = {
  start_page: number;
  end_page: number;
  start_date: string;
  end_date: string;
};

export type PlanStatus = "before" | "on_track" | "behind" | "ahead" | "done";

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  before: "開始前",
  on_track: "予定どおり",
  behind: "遅れ",
  ahead: "先行",
  done: "完了",
};

export function planDays(plan: PlanSpan): number {
  return diffDays(plan.start_date, plan.end_date) + 1;
}

export function planPages(plan: PlanSpan): number {
  return plan.end_page - plan.start_page + 1;
}

/** 1日あたりのページ数 */
export function pagesPerDay(plan: PlanSpan): number {
  return planPages(plan) / planDays(plan);
}

/**
 * その日の終わりまでに到達しているべきページ（期間内で均等に進める前提）。
 * 開始日より前は「開始ページの1つ前」、終了日以降は終了ページ。
 */
export function targetPage(plan: PlanSpan, date: string): number {
  if (date < plan.start_date) return plan.start_page - 1;
  if (date >= plan.end_date) return plan.end_page;
  const elapsed = diffDays(plan.start_date, date) + 1;
  return plan.start_page - 1 + Math.ceil((planPages(plan) * elapsed) / planDays(plan));
}

/**
 * 予定と実績の比較。
 * 今日の目標に届いていなくても、昨日までの分が終わっていれば「予定どおり」
 * （今日の分はこれからやる、という状態を遅れ扱いにしない）。
 */
export function planStatus(plan: PlanSpan, actualPage: number, today: string, yesterday: string): PlanStatus {
  if (actualPage >= plan.end_page) return "done";
  if (today < plan.start_date) return actualPage >= plan.start_page ? "ahead" : "before";
  if (actualPage > targetPage(plan, today)) return "ahead";
  if (actualPage >= targetPage(plan, yesterday)) return "on_track";
  return "behind";
}

/** 今日が期間に含まれるか */
export function isActiveOn(plan: PlanSpan, date: string): boolean {
  return plan.start_date <= date && date <= plan.end_date;
}
