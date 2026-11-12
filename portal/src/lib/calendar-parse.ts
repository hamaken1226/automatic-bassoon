import ICAL from "ical.js";
import { addDays } from "./date";

export type CalendarEvent = {
  title: string;
  /** 終日予定は YYYY-MM-DD、時刻のある予定は ISO 日時 */
  start: string;
  /** 終日予定は「最終日の翌日」（YYYY-MM-DD）、時刻のある予定は ISO 日時 */
  end: string;
  allDay: boolean;
  location: string;
};

const MAX_OCCURRENCES = 5000;

function toDateString(t: ICAL.Time): string {
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

/**
 * iCal を読み、from（日本時間の日付）から days 日分にかかる予定を返す。
 * 繰り返し予定は展開し、個別に変更・削除された回（RECURRENCE-ID / EXDATE）も反映する。
 */
export function expandEvents(ics: string, from: string, days: number): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(new ICAL.Timezone(tz));
  }
  const rangeStart = new Date(`${from}T00:00:00+09:00`).getTime();
  const rangeEnd = new Date(`${addDays(from, days)}T00:00:00+09:00`).getTime();
  const rangeFromDate = from;
  const rangeToDate = addDays(from, days);

  const vevents = root.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
  const exceptions = vevents.filter((e) => e.isRecurrenceException());
  const masters = vevents.filter((e) => !e.isRecurrenceException());
  for (const ex of exceptions) {
    const master = masters.find((m) => m.uid === ex.uid);
    if (master) master.relateException(ex);
  }

  const out: CalendarEvent[] = [];
  const push = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    if (start.isDate) {
      const s = toDateString(start);
      // DTEND が無い終日予定は1日分
      const e = end && end.compare(start) > 0 ? toDateString(end) : addDays(s, 1);
      if (s < rangeToDate && e > rangeFromDate) {
        out.push({ title: item.summary || "（タイトルなし）", start: s, end: e, allDay: true, location: item.location || "" });
      }
      return;
    }
    const s = start.toJSDate().getTime();
    const e = end ? end.toJSDate().getTime() : s;
    // 終わりの時刻ちょうどに始まる範囲は含めない。長さ0の予定は開始時刻で判定
    if (s < rangeEnd && (e > rangeStart || (e === s && s >= rangeStart))) {
      out.push({
        title: item.summary || "（タイトルなし）",
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        allDay: false,
        location: item.location || "",
      });
    }
  };

  for (const event of masters) {
    if (!event.isRecurring()) {
      push(event, event.startDate, event.endDate);
      continue;
    }
    const it = event.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      const details = event.getOccurrenceDetails(next);
      const startMs = details.startDate.isDate
        ? new Date(`${toDateString(details.startDate)}T00:00:00+09:00`).getTime()
        : details.startDate.toJSDate().getTime();
      if (startMs >= rangeEnd) break;
      push(details.item, details.startDate, details.endDate);
    }
  }

  return out.sort((a, b) => {
    const ka = a.allDay ? `${a.start}T00:00:00+09:00` : a.start;
    const kb = b.allDay ? `${b.start}T00:00:00+09:00` : b.start;
    return new Date(ka).getTime() - new Date(kb).getTime() || Number(b.allDay) - Number(a.allDay);
  });
}
