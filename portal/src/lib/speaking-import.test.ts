import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSpeakingSession } from "./speaking-import";

const sample = readFileSync(join(__dirname, "__fixtures__/speaking-part1.json"), "utf8");

describe("Speaking練習ツールのJSONの取り込み", () => {
  it("実際のファイルの項目を対応づける", () => {
    const r = parseSpeakingSession(sample, "20261104-165252_part1.json");
    expect(r).toMatchObject({
      date: "2026-11-04",
      source: "練習ツール（Food）",
      band: 6.5, // (6.5 + 6.0 + 7.0) / 3 = 6.5
      import_filename: "20261104-165252_part1.json",
    });
    expect(r.details).toMatchObject({
      part: "1",
      question: "Do you prefer eating at home or eating out? Why?",
      fluency: 6.5,
      speaking_lexical: 6,
      speaking_grammar: 7,
      pronunciation: null,
      wpm: 111.6,
      fillers: 3,
      pauses: 1,
      recorded_at: "2026-11-04T16:52:52",
    });
    expect(r.notes).toContain("フィラー");
  });
  it("フィードバックが失敗していても数値は取り込む", () => {
    const s = JSON.parse(sample);
    s.feedback = null;
    s.feedback_error = "timeout";
    const r = parseSpeakingSession(JSON.stringify(s), "x.json");
    expect(r.band).toBeNull();
    expect(r.details.wpm).toBe(111.6);
  });
  it("別の形式のファイルはエラー", () => {
    expect(() => parseSpeakingSession("{}", "a.json")).toThrow("Speaking練習ツールのファイルではない");
    expect(() => parseSpeakingSession("not json", "a.json")).toThrow("JSONとして読めません");
  });
});
