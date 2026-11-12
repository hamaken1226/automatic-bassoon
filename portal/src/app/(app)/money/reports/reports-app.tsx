"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { inputClass } from "@/components/ui/styles";
import { balances, expenseByCategory, formatYen, monthEnd, monthTotals, netWorth, recentMonths } from "@/lib/money";
import { useMoney } from "@/lib/use-money";
import { useToday } from "@/lib/use-today";
import { ErrorNote, Yen } from "../money-shared";

const MONTHS = 12;
const INCOME = "var(--series-1)";
const EXPENSE = "var(--series-2)";
const SAVINGS = "var(--series-1)";
const TOTAL = "var(--series-2)";

const monthLabel = (m: string) => `${Number(m.slice(5, 7))}月`;
const monthLong = (m: string) => `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`;

/** 目盛り: 0 を含む、きりのよい値（円） */
function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max, 1);
  const raw = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v < hi + step; v += step) ticks.push(v);
  return ticks;
}

/** 目盛りの表示（1万以上は「12万」） */
function tickLabel(v: number): string {
  const abs = Math.abs(v);
  const text = abs >= 10_000 ? `${(abs / 10_000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万` : abs.toLocaleString("ja-JP");
  return v < 0 ? `−${text}` : text;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function ReportsApp() {
  const store = useMoney();
  const today = useToday();
  const { data } = store;
  const [selected, setSelected] = useState<string | null>(null);
  const [savingsId, setSavingsId] = useState<string | null>(null);

  if (!data || !today) {
    return (
      <>
        <PageHeader title="推移・レポート" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const months = recentMonths(today, MONTHS);
  const month = selected ?? months[months.length - 1];
  const totals = months.map((m) => ({ month: m, ...monthTotals(data.txs, m) }));
  const current = totals.find((t) => t.month === month)!;

  // ---- 月ごとの収入・支出 ----
  const barTicks = niceTicks(0, Math.max(...totals.flatMap((t) => [t.income, t.expense])));
  const barMax = barTicks[barTicks.length - 1];

  // ---- カテゴリ別 ----
  const byCategory = [...expenseByCategory(data.txs, month).entries()]
    .map(([id, amount]) => ({ name: data.categories.find((c) => c.id === id)?.name ?? "カテゴリなし", amount }))
    .sort((a, b) => b.amount - a.amount);
  const categoryMax = Math.max(1, ...byCategory.map((c) => c.amount));

  // ---- 残高の推移（各月末。今月は今日まで） ----
  const banks = data.places.filter((p) => p.kind !== "credit");
  const savings =
    data.places.find((p) => p.id === savingsId) ?? banks.find((p) => p.name.includes("貯金")) ?? banks[0];
  const points = months.map((m) => {
    const upTo = m === today.slice(0, 7) ? today : monthEnd(m);
    return {
      month: m,
      savings: savings ? (balances(data.places, data.txs, upTo).get(savings.id) ?? 0) : 0,
      total: netWorth(data.places, data.txs, upTo),
    };
  });
  const lineTicks = niceTicks(Math.min(...points.flatMap((p) => [p.savings, p.total])), Math.max(...points.flatMap((p) => [p.savings, p.total])));
  const lineMin = lineTicks[0];
  const lineMax = lineTicks[lineTicks.length - 1];
  const W = 600;
  const H = 200;
  const x = (i: number) => (W * (i + 0.5)) / months.length;
  const y = (v: number) => H - ((v - lineMin) / (lineMax - lineMin || 1)) * H;
  const path = (key: "savings" | "total") => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p[key])}`).join(" ");
  const point = points.find((p) => p.month === month)!;

  const monthButtons = (render: (m: string, i: number) => React.ReactNode, height: string) => (
    <div className={`absolute inset-0 flex ${height}`}>
      {months.map((m, i) => (
        <button
          key={m}
          type="button"
          aria-label={monthLong(m)}
          aria-pressed={m === month}
          onMouseEnter={() => setSelected(m)}
          onFocus={() => setSelected(m)}
          onClick={() => setSelected(m)}
          className={`relative flex min-w-0 flex-1 items-end justify-center gap-[2px] rounded-t-md ${m === month ? "bg-foreground/5" : ""}`}
        >
          {render(m, i)}
        </button>
      ))}
    </div>
  );

  const axis = (ticks: number[]) => (
    <>
      <div className="flex h-48 flex-col-reverse justify-between text-right text-[10px] leading-none text-muted" aria-hidden>
        {ticks.map((t) => (
          <span key={t}>{tickLabel(t)}</span>
        ))}
      </div>
    </>
  );
  const grid = (ticks: number[]) => (
    <div className="absolute inset-0 flex flex-col-reverse justify-between" aria-hidden>
      {ticks.map((t) => (
        <span key={t} className={`block h-px ${t === 0 ? "bg-muted/60" : "bg-border"}`} />
      ))}
    </div>
  );
  const xLabels = (
    <div className="ml-10 mt-1 flex text-[10px] text-muted" aria-hidden>
      {months.map((m, i) => (
        <span key={m} className="min-w-0 flex-1 text-center">
          {(months.length - 1 - i) % 2 === 0 ? monthLabel(m) : ""}
        </span>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="推移・レポート" description="グラフの月をタップすると、その月の内訳を表示します" />
      <ErrorNote error={store.error} />

      <div className="space-y-4">
        <section aria-label="月ごとの収入と支出" className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">月ごとの収入・支出</h2>
            <Legend
              items={[
                { label: "収入", color: INCOME },
                { label: "支出", color: EXPENSE },
              ]}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <div className="w-8 shrink-0">{axis(barTicks)}</div>
            <div className="relative h-48 min-w-0 flex-1">
              {grid(barTicks)}
              {monthButtons((m) => {
                const t = totals.find((x) => x.month === m)!;
                return (
                  <>
                    <span className="block w-[30%] max-w-3 rounded-t" style={{ background: INCOME, height: `${(t.income / barMax) * 100}%` }} />
                    <span className="block w-[30%] max-w-3 rounded-t" style={{ background: EXPENSE, height: `${(t.expense / barMax) * 100}%` }} />
                  </>
                );
              }, "")}
            </div>
          </div>
          {xLabels}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-background px-3 py-2 text-sm sm:grid-cols-4" aria-live="polite">
            <div className="col-span-2 font-semibold sm:col-span-4">{monthLong(month)}</div>
            {[
              ["収入", current.income],
              ["支出", current.expense],
              ["差額", current.diff],
              ["調整", current.adjustment],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-muted">{label}</dt>
                <dd>
                  <Yen value={value as number} signed={label === "差額" || label === "調整"} />
                </dd>
              </div>
            ))}
          </dl>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted">表で見る</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-right text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 text-left font-semibold">月</th>
                    <th className="py-1 font-semibold">収入</th>
                    <th className="py-1 font-semibold">支出</th>
                    <th className="py-1 font-semibold">差額</th>
                    <th className="py-1 font-semibold">調整</th>
                  </tr>
                </thead>
                <tbody>
                  {[...totals].reverse().map((t) => (
                    <tr key={t.month} className="border-t border-border">
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {monthLong(t.month)}
                      </th>
                      <td className="py-1.5">{formatYen(t.income)}</td>
                      <td className="py-1.5">{formatYen(t.expense)}</td>
                      <td className="py-1.5">
                        <Yen value={t.diff} signed />
                      </td>
                      <td className="py-1.5">{t.adjustment === 0 ? "—" : <Yen value={t.adjustment} signed />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section aria-label="カテゴリ別の支出" className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">カテゴリ別の支出（{monthLong(month)}）</h2>
            <span className="text-sm font-semibold">{formatYen(current.expense)}</span>
          </div>
          {byCategory.length === 0 ? (
            <p className="mt-2 text-sm text-muted">この月の支出はありません</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {byCategory.map((c) => (
                <li key={c.name} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="h-3 rounded-r" style={{ background: EXPENSE, width: `${Math.max(1, (c.amount / categoryMax) * 100)}%` }} />
                  <span className="text-right tabular-nums">
                    {formatYen(c.amount)}
                    <span className="ml-1.5 text-xs text-muted">{Math.round((c.amount / current.expense) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="残高の推移" className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">残高の推移（月末時点）</h2>
            <Legend
              items={[
                { label: savings?.name ?? "貯金口座", color: SAVINGS },
                { label: "全体の合計（資産−クレカ未払い）", color: TOTAL },
              ]}
            />
          </div>
          {banks.length > 1 && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              貯金として表示する置き場所
              <select value={savings?.id ?? ""} onChange={(e) => setSavingsId(e.target.value)} className={`${inputClass} w-auto py-1 text-sm`}>
                {banks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <div className="w-8 shrink-0">{axis(lineTicks)}</div>
            <div className="relative h-48 min-w-0 flex-1">
              {grid(lineTicks)}
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                {(["savings", "total"] as const).map((key) => (
                  <path
                    key={key}
                    d={path(key)}
                    fill="none"
                    stroke={key === "savings" ? SAVINGS : TOTAL}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {monthButtons(
                (m, i) => (
                  <>
                    {(["savings", "total"] as const).map((key) => (
                      <span
                        key={key}
                        className={`absolute left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-card ${m === month ? "" : "opacity-0"}`}
                        style={{ background: key === "savings" ? SAVINGS : TOTAL, bottom: `${((points[i][key] - lineMin) / (lineMax - lineMin || 1)) * 100}%` }}
                      />
                    ))}
                  </>
                ),
                "",
              )}
            </div>
          </div>
          {xLabels}
          <dl className="mt-3 grid gap-1 rounded-lg bg-background px-3 py-2 text-sm" aria-live="polite">
            <div className="font-semibold">{monthLong(month)}末</div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{savings?.name}</dt>
              <dd>
                <Yen value={point.savings} />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">全体の合計</dt>
              <dd>
                <Yen value={point.total} />
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
