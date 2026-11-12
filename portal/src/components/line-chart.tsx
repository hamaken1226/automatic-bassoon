"use client";

import { useState } from "react";
import { formatDateShort } from "@/lib/date";

export type LinePoint = {
  date: string;
  value: number;
  label?: string;
  /** 並べる順のキー（省略時は日付）。同じ日に複数あるときの順番に使う */
  order?: string;
};
export type LineSeries = { name: string; color: string; points: LinePoint[] };

/**
 * 記録した順に並べる折れ線グラフ（同じ日に何回も記録しても重ならない）。目標などの基準線（reference）を1本引ける。
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
  // 横位置は全系列を通した順番（系列が複数でも時期がそろう。点が1つなら真ん中）
  const ranked = series
    .flatMap((s, si) => s.points.map((p, i) => ({ si, i, key: p.order ?? p.date })))
    .sort((a, b) => a.key.localeCompare(b.key) || a.si - b.si || a.i - b.i);
  const rank = new Map(ranked.map((r, n) => [`${r.si}-${r.i}`, n]));
  const xPct = (si: number, i: number) => {
    const count = ranked.length;
    return count <= 1 ? 50 : 4 + ((rank.get(`${si}-${i}`) ?? 0) / (count - 1)) * 92;
  };
  const yPct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * 100;
  // 何も選んでいないときは、全系列で最も新しい点を出す
  const newest = ranked[ranked.length - 1];
  const current = active ?? (newest ? { s: newest.si, i: newest.i } : null);
  const info = current ? series[current.s]?.points[current.i] : undefined;
  const infoSeries = current ? series[current.s] : undefined;

  return (
    <div>
      {/* 2本以上のときは凡例を出す（色だけに頼らない） */}
      {series.length > 1 && (
        <ul className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          {series.map((s) => (
            <li key={s.name} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
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
            {series.map((s, si) => (
              <polyline
                key={s.name}
                points={s.points.map((p, i) => `${xPct(si, i)},${100 - yPct(p.value)}`).join(" ")}
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
                style={{ left: `${xPct(si, i)}%`, bottom: `${yPct(p.value)}%` }}
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
