"use client";

import { Flame } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  bucketKey,
  bucketLabel,
  dayOf,
  durationMinutes,
  minutesBetween,
  minutesByDay,
  periods,
  recentBuckets,
  streak,
  type Unit,
} from "@/lib/attendance";
import { addDays, formatDateShort, formatMinutes, weekStart, WEEKDAY_LABELS } from "@/lib/date";
import { KIND_COLORS, type StudyData } from "@/lib/study";
import type { AttendanceKind, AttendanceRecord } from "@/lib/types";

type GroupBy = "kind" | "initiative" | "subject";
type Series = { id: string; name: string; color: string };

const OTHER: Series = { id: "__other", name: "未分類", color: "var(--muted)" };
const HEATMAP_WEEKS = 26;
const BUCKET_COUNT: Record<Unit, number> = { day: 14, week: 12, month: 12 };
const UNIT_LABEL: Record<Unit, string> = { day: "日", week: "週", month: "月" };
const GROUP_LABEL: Record<GroupBy, string> = { kind: "種類別", initiative: "取り組み別", subject: "科目別" };

/** 記録時間 → ヒートマップの濃さ（0〜4）。長い日ほど濃い */
function heatLevel(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes <= 60) return 1;
  if (minutes <= 120) return 2;
  if (minutes <= 240) return 3;
  return 4;
}

// 1つの色の濃淡で量を表す（0は記録なし）
const HEAT_COLORS = [
  "color-mix(in srgb, var(--foreground) 7%, var(--card))",
  "color-mix(in srgb, var(--accent) 30%, var(--card))",
  "color-mix(in srgb, var(--accent) 55%, var(--card))",
  "color-mix(in srgb, var(--accent) 78%, var(--card))",
  "var(--accent)",
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5 text-sm">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`rounded-md px-2.5 py-1 ${value === key ? "bg-accent-soft font-semibold text-accent" : "text-muted"}`}
        >
          {options[key]}
        </button>
      ))}
    </div>
  );
}

/** 頑張りの見える化: 連続記録・今週/今月の合計・ヒートマップ・グラフ・累計 */
export function Stats({
  records,
  kinds,
  data,
  today,
}: {
  records: AttendanceRecord[];
  kinds: AttendanceKind[];
  data: StudyData;
  today: string;
}) {
  const [unit, setUnit] = useState<Unit>("day");
  const [groupBy, setGroupBy] = useState<GroupBy>("kind");
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const heatmapRef = useRef<HTMLDivElement>(null);

  // ヒートマップは最新の週（右端）が見える位置から始める
  useEffect(() => {
    const el = heatmapRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const byDay = useMemo(() => minutesByDay(records), [records]);
  const p = periods(today);
  const week = minutesBetween(byDay, ...p.thisWeek);
  const lastWeek = minutesBetween(byDay, ...p.lastWeek);
  const month = minutesBetween(byDay, ...p.thisMonth);
  const lastMonth = minutesBetween(byDay, ...p.lastMonth);
  const overallStreak = streak(new Set(byDay.keys()), today);
  const kindStreaks = kinds.map((k) => ({
    kind: k,
    days: streak(new Set(records.filter((r) => r.kind_id === k.id).map(dayOf)), today),
  }));

  // ---- グラフの系列（種類・取り組み・科目）。色は項目ごとに固定で、並び順では変わらない ----
  const series = useMemo<Series[]>(() => {
    if (groupBy === "kind") return kinds.map((k) => ({ id: k.id, name: k.name, color: k.color }));
    if (groupBy === "initiative") {
      return data.initiatives.map((i, n) => ({ id: i.id, name: i.name, color: KIND_COLORS[n] ?? OTHER.color }));
    }
    return data.subjects.map((s, n) => ({
      id: s.id,
      name: `${data.initiatives.find((i) => i.id === s.initiative_id)?.name ?? ""} / ${s.name}`,
      color: KIND_COLORS[n] ?? OTHER.color,
    }));
  }, [groupBy, kinds, data]);

  const seriesIdOf = (r: AttendanceRecord): string => {
    const id = groupBy === "kind" ? r.kind_id : groupBy === "initiative" ? r.initiative_id : r.subject_id;
    return id && series.some((s) => s.id === id) ? id : OTHER.id;
  };

  const totals = new Map<string, number>(); // 系列ごとの累計
  const buckets = new Map<string, Map<string, number>>(); // 区切り → 系列 → 分
  for (const r of records) {
    const sid = seriesIdOf(r);
    const minutes = durationMinutes(r);
    totals.set(sid, (totals.get(sid) ?? 0) + minutes);
    const key = bucketKey(dayOf(r), unit);
    const bucket = buckets.get(key) ?? new Map<string, number>();
    bucket.set(sid, (bucket.get(sid) ?? 0) + minutes);
    buckets.set(key, bucket);
  }
  const allSeries = totals.has(OTHER.id) ? [...series, OTHER] : series;
  const usedSeries = allSeries.filter((s) => (totals.get(s.id) ?? 0) > 0);
  const keys = recentBuckets(today, unit, BUCKET_COUNT[unit]);
  const bucketTotal = (key: string) => [...(buckets.get(key)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const maxMinutes = Math.max(60, ...keys.map(bucketTotal));
  // 目盛りの上限はきりのよい時間にする
  const stepHours = maxMinutes <= 240 ? 1 : maxMinutes <= 600 ? 2 : maxMinutes <= 1500 ? 5 : 10;
  const axisMax = Math.ceil(maxMinutes / 60 / stepHours) * stepHours * 60;
  const ticks = [axisMax, axisMax / 2, 0];
  const shownBucket = activeBucket && keys.includes(activeBucket) ? activeBucket : keys[keys.length - 1];
  const bucketName = (key: string) =>
    unit === "day" ? formatDateShort(key, today) : unit === "week" ? `${bucketLabel(key, unit)}の週` : `${Number(key.slice(0, 4))}年${Number(key.slice(5, 7))}月`;

  // ---- ヒートマップ（週ごとの列、月曜始まり） ----
  const firstWeek = addDays(weekStart(today), -7 * (HEATMAP_WEEKS - 1));
  const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(firstWeek, w * 7 + d)),
  );
  const shownDay = activeDay ?? today;

  const compare = (current: number, previous: number, label: string) => {
    const diff = current - previous;
    return (
      <p className="text-xs text-muted">
        {label}: {formatMinutes(previous)}
        {diff !== 0 && (
          <span className={`ml-1.5 font-semibold ${diff > 0 ? "text-accent" : ""}`}>
            {diff > 0 ? "+" : "−"}
            {formatMinutes(Math.abs(diff))}
          </span>
        )}
      </p>
    );
  };

  return (
    <div className="mt-4 space-y-4">
      <section aria-label="合計と連続記録" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="col-span-2 rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <p className="text-xs text-muted">連続記録</p>
          <p className="flex items-center gap-1.5 text-3xl font-bold">
            <Flame className={`size-6 ${overallStreak > 0 ? "text-accent" : "text-muted"}`} aria-hidden />
            {overallStreak}
            <span className="text-base font-normal">日</span>
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            {kindStreaks.map(({ kind, days }) => (
              <li key={kind.id} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: kind.color }} />
                {kind.name} {days}日
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">今週</p>
          <p className="text-2xl font-bold">{formatMinutes(week)}</p>
          {compare(week, lastWeek, "先週")}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">今月</p>
          <p className="text-2xl font-bold">{formatMinutes(month)}</p>
          {compare(month, lastMonth, "先月")}
        </div>
      </section>

      <section aria-label="記録カレンダー" className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-sm font-semibold">記録カレンダー</h2>
          <p className="text-sm" aria-live="polite">
            <span className="text-muted">{shownDay === today ? "今日" : formatDateShort(shownDay, today)}</span>
            <span className="ml-2 font-semibold">{formatMinutes(byDay.get(shownDay) ?? 0)}</span>
          </p>
        </div>
        <div ref={heatmapRef} className="overflow-x-auto px-1 pb-1.5">
          <div className="inline-flex gap-[3px]">
            <div className="mt-5 flex flex-col gap-[3px] pr-1 text-[10px] leading-[14px] text-muted" aria-hidden>
              {[1, 2, 3, 4, 5, 6, 0].map((d, i) => (
                <span key={d} className="h-[14px]">
                  {i % 2 === 0 ? WEEKDAY_LABELS[d] : ""}
                </span>
              ))}
            </div>
            {weeks.map((days, w) => {
              const month = Number(days[0].slice(5, 7));
              const showMonth = w === 0 || Number(weeks[w - 1][0].slice(5, 7)) !== month;
              return (
                <div key={days[0]} className="flex flex-col gap-[3px]">
                  <span className="h-4 w-[14px] whitespace-nowrap text-[10px] text-muted" aria-hidden>
                    {showMonth ? `${month}月` : ""}
                  </span>
                  {days.map((day) => {
                    const minutes = byDay.get(day) ?? 0;
                    const future = day > today;
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={future}
                        aria-label={`${formatDateShort(day, today)} ${formatMinutes(minutes)}`}
                        onMouseEnter={() => setActiveDay(day)}
                        onFocus={() => setActiveDay(day)}
                        onClick={() => setActiveDay(day)}
                        className={`size-[14px] rounded-[3px] ${future ? "opacity-0" : ""} ${
                          day === shownDay ? "outline outline-2 outline-offset-1 outline-foreground/60" : ""
                        }`}
                        style={{ background: HEAT_COLORS[heatLevel(minutes)] }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted">
          短い
          {HEAT_COLORS.slice(1).map((c) => (
            <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          長い
        </p>
      </section>

      <section aria-label="記録時間のグラフ" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">記録時間</h2>
          <div className="flex flex-wrap gap-2">
            <Segmented label="集計の単位" value={unit} options={UNIT_LABEL} onChange={setUnit} />
            <Segmented label="内訳" value={groupBy} options={GROUP_LABEL} onChange={setGroupBy} />
          </div>
        </div>

        {/* 凡例（色だけに頼らないよう名前を必ず出す） */}
        {usedSeries.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {usedSeries.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex gap-2">
          <div className="flex h-44 flex-col justify-between text-right text-[10px] leading-none text-muted" aria-hidden>
            {ticks.map((t) => (
              <span key={t}>{t / 60}時間</span>
            ))}
          </div>
          <div className="relative h-44 min-w-0 flex-1">
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="block h-px bg-border" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-stretch">
              {keys.map((key) => {
                const bucket = buckets.get(key);
                const total = bucketTotal(key);
                const segments = allSeries.filter((s) => (bucket?.get(s.id) ?? 0) > 0);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`${bucketName(key)} ${formatMinutes(total)}`}
                    aria-pressed={key === shownBucket}
                    onMouseEnter={() => setActiveBucket(key)}
                    onFocus={() => setActiveBucket(key)}
                    onClick={() => setActiveBucket(key)}
                    className={`flex min-w-0 flex-1 flex-col-reverse items-center gap-[2px] rounded-t-md ${
                      key === shownBucket ? "bg-foreground/5" : ""
                    }`}
                  >
                    {segments.map((s, i) => (
                      <span
                        key={s.id}
                        className={`block w-3/5 max-w-6 ${i === segments.length - 1 ? "rounded-t" : ""}`}
                        style={{ background: s.color, height: `${((bucket?.get(s.id) ?? 0) / axisMax) * 100}%` }}
                      />
                    ))}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="ml-9 mt-1 flex text-[10px] text-muted" aria-hidden>
          {keys.map((key, i) => (
            <span key={key} className="min-w-0 flex-1 text-center">
              {/* ラベルが重ならないよう1つおきに出す（最後は必ず出す） */}
              {(keys.length - 1 - i) % 2 === 0 ? bucketLabel(key, unit) : ""}
            </span>
          ))}
        </div>

        {/* 選んだ棒の内訳 */}
        <div className="mt-3 rounded-lg bg-background px-3 py-2 text-sm" aria-live="polite">
          <p className="flex justify-between gap-2">
            <span className="text-muted">{bucketName(shownBucket)}</span>
            <span className="font-semibold">{formatMinutes(bucketTotal(shownBucket))}</span>
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {allSeries
              .filter((s) => (buckets.get(shownBucket)?.get(s.id) ?? 0) >= 0.5)
              .map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span>{formatMinutes(buckets.get(shownBucket)?.get(s.id) ?? 0)}</span>
                </li>
              ))}
          </ul>
        </div>

        <h3 className="mt-4 mb-1 text-xs font-semibold text-muted">累計（{GROUP_LABEL[groupBy]}）</h3>
        {usedSeries.length === 0 ? (
          <p className="text-sm text-muted">記録はまだありません</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {[...usedSeries]
                .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0))
                .map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                        {s.name}
                      </span>
                    </th>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{formatMinutes(totals.get(s.id) ?? 0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
