"use client";

import { useState } from "react";
import { diffDays, formatDateShort } from "@/lib/date";

export type LinePoint = { date: string; value: number; label?: string };
export type LineSeries = { name: string; color: string; points: LinePoint[] };

/**
 * 日付を横軸にした折れ線グラフ。目標などの基準線（reference）を1本引ける。
 * 点をタップ（ホバー）すると下に値を表示する。
 */
export function LineChart({
  series,
  min,
  max,
  ticks,
  reference,
  format = (v) => String(v),
  height = "h-36",
  today,
  emptyText = "記録はまだありません",
}: {
  series: LineSeries[];
  min: number;
  max: number;
  ticks: number[];
  reference?: { value: number; label: string };
  format?: (v: number) => string;
  height?: string;
  today: string;
  emptyText?: string;
}) {
  const [active, setActive] = useState<{ s: number; i: number } | null>(null);
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return <p className="rounded-lg bg-background px-3 py-6 text-center text-sm text-muted">{emptyText}</p>;
  }
  const dates = all.map((p) => p.date).sort();
  const first = dates[0];
  const span = Math.max(1, diffDays(first, dates[dates.length - 1]));
  const xPct = (d: string) => (all.length === 1 || span === 0 ? 50 : 4 + (diffDays(first, d) / span) * 92);
  const yPct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * 100;
  const shown = active ? series[active.s]?.points[active.i] : undefined;
  const last = series.map((s) => s.points[s.points.length - 1]).find(Boolean);
  const info = shown ?? last;
  const infoSeries = active ? series[active.s] : series.find((s) => s.points.length > 0);

  return (
    <div>
      <div className="flex gap-2">
        <div className={`flex ${height} w-7 shrink-0 flex-col-reverse justify-between text-right text-[10px] leading-none text-muted`} aria-hidden>
          {ticks.map((t) => (
            <span key={t}>{format(t)}</span>
          ))}
        </div>
        <div className={`relative ${height} min-w-0 flex-1`}>
          <div className="absolute inset-0 flex flex-col-reverse justify-between" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="block h-px bg-border" />
            ))}
          </div>
          {reference && (
            <div className="absolute inset-x-0" style={{ bottom: `${yPct(reference.value)}%` }} aria-hidden>
              <span className="block h-px bg-foreground/50" />
              <span className="absolute right-0 bottom-0.5 rounded bg-card/80 px-1 text-[10px] text-muted">{reference.label}</span>
            </div>
          )}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {series.map((s) => (
              <polyline
                key={s.name}
                points={s.points.map((p) => `${xPct(p.date)},${100 - yPct(p.value)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {series.map((s, si) =>
            s.points.map((p, i) => (
              <button
                key={`${s.name}-${i}`}
                type="button"
                aria-label={`${s.name} ${formatDateShort(p.date, today)} ${format(p.value)}`}
                onMouseEnter={() => setActive({ s: si, i })}
                onFocus={() => setActive({ s: si, i })}
                onClick={() => setActive({ s: si, i })}
                className="absolute flex size-6 -translate-x-1/2 translate-y-1/2 items-center justify-center"
                style={{ left: `${xPct(p.date)}%`, bottom: `${yPct(p.value)}%` }}
              >
                <span
                  className={`block rounded-full ring-2 ring-card ${active?.s === si && active.i === i ? "size-3" : "size-2"}`}
                  style={{ background: s.color }}
                />
              </button>
            )),
          )}
        </div>
      </div>
      <div className="ml-9 mt-1 flex justify-between text-[10px] text-muted" aria-hidden>
        <span>{formatDateShort(first, today)}</span>
        {dates.length > 1 && <span>{formatDateShort(dates[dates.length - 1], today)}</span>}
      </div>
      {info && (
        <p className="mt-1 text-xs text-muted" aria-live="polite">
          {active ? "" : "最新: "}
          {formatDateShort(info.date, today)} {series.length > 1 && infoSeries ? `${infoSeries.name} ` : ""}
          <span className="font-semibold text-foreground">{format(info.value)}</span>
          {info.label && <span className="ml-1">{info.label}</span>}
        </p>
      )}
    </div>
  );
}
