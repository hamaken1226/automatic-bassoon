import { describe, expect, it } from "vitest";
import { overallBand, parseIeltsResult, rawToBand, roundBand, speakingBand } from "./ielts";

describe("換算", () => {
  it("Listening", () => {
    expect(rawToBand("listening", 40)).toBe(9);
    expect(rawToBand("listening", 35)).toBe(8);
    expect(rawToBand("listening", 31)).toBe(7);
    expect(rawToBand("listening", 30)).toBe(7);
    expect(rawToBand("listening", 29)).toBe(6.5);
    expect(rawToBand("listening", 5)).toBe(3.5);
  });
  it("Reading（General Training）", () => {
    expect(rawToBand("reading", 40)).toBe(9);
    expect(rawToBand("reading", 37)).toBe(8);
    expect(rawToBand("reading", 35)).toBe(7);
    expect(rawToBand("reading", 34)).toBe(6.5);
    expect(rawToBand("reading", 32)).toBe(6.5);
    expect(rawToBand("reading", 23)).toBe(5);
  });
  it("40問でないときは40問に換算", () => {
    expect(rawToBand("listening", 9, 10)).toBe(8); // 9/10 → 36/40 → 8.0
    expect(rawToBand("reading", 13, 13)).toBe(9);
  });
  it("不正な入力", () => {
    expect(rawToBand("reading", 41, 40)).toBeNull();
    expect(rawToBand("reading", 5, 0)).toBeNull();
  });
});

describe("端数処理", () => {
  it("IELTSの規則（.25は.5に、.75は次の整数に）", () => {
    expect(roundBand(6.125)).toBe(6);
    expect(roundBand(6.25)).toBe(6.5);
    expect(roundBand(6.5)).toBe(6.5);
    expect(roundBand(6.625)).toBe(6.5);
    expect(roundBand(6.75)).toBe(7);
    expect(roundBand(6.875)).toBe(7);
  });
  it("オーバーオール", () => {
    expect(overallBand({ listening: 8, reading: 7.5, writing: 6.5, speaking: 7 })).toBe(7.5); // 7.25
    expect(overallBand({ listening: 6.5, reading: 6.5, writing: 5, speaking: 7 })).toBe(6.5); // 6.25
    expect(overallBand({ listening: 7, reading: 7, writing: 7, speaking: 6 })).toBe(7); // 6.75
    expect(overallBand({ listening: 7, reading: 7, writing: 7 })).toBeNull();
  });
  it("Speakingは入力された観点の平均", () => {
    expect(speakingBand([6, 6.5, 7, null])).toBe(6.5);
    expect(speakingBand([6, 6, 6, 7])).toBe(6.5); // 6.25
    expect(speakingBand([null, undefined])).toBeNull();
  });
});

describe("Claudeの返答の読み取り", () => {
  it("Reading", () => {
    const text = `採点しました。…\n\n\`\`\`\n[IELTS-RESULT]\nskill: Reading\ndifficulty: 6.5\ncorrect: 32\ntotal: 40\ncomment: 段落の言い換えに時間がかかった\n\`\`\`\nがんばって！`;
    expect(parseIeltsResult(text)).toEqual({ skill: "Reading", difficulty: "6.5", correct: "32", total: "40", comment: "段落の言い換えに時間がかかった" });
  });
  it("Writing（複数行のフィードバック）", () => {
    const text = [
      "[IELTS-RESULT]",
      "skill: Writing",
      "task: 2",
      "overall: 6.5",
      "task_response: 6.0",
      "coherence_cohesion: 6.5",
      "lexical_resource: 6.5",
      "grammar: 7.0",
      "feedback: |",
      "  1. Introduction is clear.",
      "",
      "  2. Use more linking words:",
      "     - however",
    ].join("\n");
    const r = parseIeltsResult(text)!;
    expect(r.grammar).toBe("7.0");
    expect(r.feedback).toBe("1. Introduction is clear.\n\n2. Use more linking words:\n   - however");
  });
  it("ブロックが無ければ null", () => {
    expect(parseIeltsResult("score: 7")).toBeNull();
  });
});
