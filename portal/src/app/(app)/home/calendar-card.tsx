"use client";

import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, formatDateShort, formatTime } from "@/lib/date";
import type { CalendarEvent } from "@/lib/calendar-parse";
import { HomeCard, Loading } from "./home-card";

type State = { status: "loading" } | { status: "error"; notConfigured: boolean } | { status: "ok"; from: string; days: number; events: CalendarEvent[]; calendars: number; failed: number };

const DAY_LABELS = ["今日", "明日", "明後日"];

/** Googleカレンダーの今日〜3日後の予定（読み取りのみ）。失敗してもこのカードの中だけで知らせる */
export function CalendarCard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    fetch("/api/calendar", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return setState({ status: "error", notConfigured: body.error === "not_configured" });
        }
        const body = (await res.json()) as { from: string; days: number; events: CalendarEvent[]; calendars?: number; failed?: number };
        setState({ status: "ok", calendars: 1, failed: 0, ...body });
      })
      .catch(() => setState({ status: "error", notConfigured: false }));
  }, []);

  return (
    <HomeCard title="予定">
      {state.status === "loading" ? (
        <Loading />
      ) : state.status === "error" ? (
        <p className="text-sm text-muted">
          予定を読み込めませんでした
          {state.notConfigured && <span className="block text-xs">（GOOGLE_CALENDAR_ICAL_URL が設定されていません）</span>}
        </p>
      ) : (
        <>
        {state.failed > 0 && <p className="mb-2 text-xs text-muted">一部のカレンダーを読み込めませんでした</p>}
        <ol className="space-y-2.5">
          {Array.from({ length: state.days }, (_, i) => {
            const day = addDays(state.from, i);
            // その日にかかる予定（終日予定は期間に含まれる日すべてに出す）
            const events = state.events.filter((e) =>
              e.allDay ? e.start <= day && day < e.end : new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(e.start)) === day,
            );
            return (
              <li key={day}>
                <h3 className="text-xs font-semibold text-muted">
                  {DAY_LABELS[i] ? `${DAY_LABELS[i]} ` : ""}
                  {formatDateShort(day, state.from)}
                </h3>
                {events.length === 0 ? (
                  <p className="text-sm text-muted">予定なし</p>
                ) : (
                  <ul className="mt-0.5 space-y-0.5">
                    {events.map((e, j) => (
                      <li key={`${e.title}-${e.start}-${j}`} className="flex gap-2 text-sm">
                        <span className="w-24 shrink-0 tabular-nums text-muted">
                          {e.allDay ? "終日" : e.start === e.end ? formatTime(e.start) : `${formatTime(e.start)}〜${formatTime(e.end)}`}
                        </span>
                        <span className="min-w-0 break-words">
                          {e.title}
                          {state.calendars > 1 && e.calendar && <span className="ml-1.5 text-xs text-muted">［{e.calendar}］</span>}
                          {e.location && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-muted">
                              <MapPin className="size-3" aria-hidden />
                              {e.location}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
        </>
      )}
    </HomeCard>
  );
}
