import { describe, expect, it } from "vitest";
import { expandEvents, sortEvents, splitCalendarUrls } from "./calendar-parse";

const ics = (events: string) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "X-WR-CALNAME:個人",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
    events,
    "END:VCALENDAR",
  ].join("\r\n");

const ev = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("iCalの展開", () => {
  it("1回だけの予定（日本時間・UTC）と範囲外", () => {
    const result = expandEvents(
      ics(
        [
          ev(["UID:a", "SUMMARY:歯医者", "DTSTART;TZID=Asia/Tokyo:20261112T100000", "DTEND;TZID=Asia/Tokyo:20261112T110000", "LOCATION:駅前"]),
          ev(["UID:b", "SUMMARY:UTCの予定", "DTSTART:20261113T150000Z", "DTEND:20261113T160000Z"]), // 日本時間 11/14 0:00
          ev(["UID:c", "SUMMARY:範囲外", "DTSTART;TZID=Asia/Tokyo:20261116T100000", "DTEND;TZID=Asia/Tokyo:20261116T110000"]),
        ].join("\r\n"),
      ),
      "2026-11-12",
      4,
    );
    expect(result.map((e) => e.title)).toEqual(["歯医者", "UTCの予定"]);
    expect(result[0]).toMatchObject({ start: "2026-11-12T01:00:00.000Z", location: "駅前", allDay: false });
  });

  it("終日予定（複数日・範囲の前から続くもの）", () => {
    const result = expandEvents(
      ics(
        [
          ev(["UID:d", "SUMMARY:旅行", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261113"]), // 11/10〜11/12
          ev(["UID:e", "SUMMARY:謎検", "DTSTART;VALUE=DATE:20261115", "DTEND;VALUE=DATE:20261116"]),
          ev(["UID:f", "SUMMARY:昨日まで", "DTSTART;VALUE=DATE:20261110", "DTEND;VALUE=DATE:20261112"]),
        ].join("\r\n"),
      ),
      "2026-11-12",
      4,
    );
    expect(result.map((e) => [e.title, e.start, e.end, e.allDay])).toEqual([
      ["旅行", "2026-11-10", "2026-11-13", true],
      ["謎検", "2026-11-15", "2026-11-16", true],
    ]);
  });

  it("繰り返し予定: 毎日・除外日・個別に変更した回・中止した回", () => {
    const result = expandEvents(
      ics(
        [
          ev([
            "UID:r",
            "SUMMARY:朝ラン",
            "DTSTART;TZID=Asia/Tokyo:20261101T070000",
            "DTEND;TZID=Asia/Tokyo:20261101T073000",
            "RRULE:FREQ=DAILY",
            "EXDATE;TZID=Asia/Tokyo:20261113T070000",
          ]),
          ev([
            "UID:r",
            "SUMMARY:朝ラン（遅め）",
            "RECURRENCE-ID;TZID=Asia/Tokyo:20261114T070000",
            "DTSTART;TZID=Asia/Tokyo:20261114T090000",
            "DTEND;TZID=Asia/Tokyo:20261114T093000",
          ]),
          ev([
            "UID:w",
            "SUMMARY:バンド練習",
            "DTSTART;TZID=Asia/Tokyo:20261008T190000",
            "DTEND;TZID=Asia/Tokyo:20261008T210000",
            "RRULE:FREQ=WEEKLY;BYDAY=TH,SU",
          ]),
          ev(["UID:w", "SUMMARY:バンド練習", "STATUS:CANCELLED", "RECURRENCE-ID;TZID=Asia/Tokyo:20261115T190000", "DTSTART;TZID=Asia/Tokyo:20261115T190000"]),
        ].join("\r\n"),
      ),
      "2026-11-12",
      4,
    );
    expect(result.map((e) => `${e.title} ${e.start}`)).toEqual([
      "朝ラン 2026-11-11T22:00:00.000Z", // 11/12 7:00
      "バンド練習 2026-11-12T10:00:00.000Z", // 11/12(木) 19:00
      // 11/13 は除外
      "朝ラン（遅め） 2026-11-14T00:00:00.000Z", // 11/14 9:00 に変更
      "朝ラン 2026-11-14T22:00:00.000Z", // 11/15 7:00
      // 11/15(日) のバンド練習は中止
    ]);
  });
});

describe("複数のカレンダー", () => {
  it("URLを改行・カンマで区切って読む（重複と不正な値は除く）", () => {
    expect(
      splitCalendarUrls(" https://a.example/basic.ics,\nhttps://b.example/basic.ics  https://a.example/basic.ics\nfoo "),
    ).toEqual(["https://a.example/basic.ics", "https://b.example/basic.ics"]);
    expect(splitCalendarUrls(undefined)).toEqual([]);
  });
  it("カレンダー名を持ち、合わせて時刻順に並べる", () => {
    const a = expandEvents(ics(ev(["UID:1", "SUMMARY:A", "DTSTART;TZID=Asia/Tokyo:20261112T150000", "DTEND;TZID=Asia/Tokyo:20261112T160000"])), "2026-11-12", 4);
    const b = expandEvents(ics(ev(["UID:2", "SUMMARY:B", "DTSTART;TZID=Asia/Tokyo:20261112T090000", "DTEND;TZID=Asia/Tokyo:20261112T100000"])).replace("個人", "仕事"), "2026-11-12", 4);
    expect(sortEvents([...a, ...b]).map((e) => `${e.title}:${e.calendar}`)).toEqual(["B:仕事", "A:個人"]);
  });
});
