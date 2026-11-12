import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { checkPlanCsv, normalizeDate, planKey, type PlanCsvContext } from "./plan-csv";

const ctx: PlanCsvContext = {
  exams: [{ name: "中小企業診断士", subjects: [{ name: "財務・会計", materials: ["〇〇テキスト"] }] }],
  existingKeys: new Set(),
};
const header = "試験,科目,教材,内容,開始ページ,終了ページ,開始日,終了日";

describe("CSV", () => {
  it("BOM・CRLF・ダブルクォート・空行", () => {
    expect(parseCsv('﻿a,b\r\n"x,1","say ""hi"""\r\n\r\n"改行\nあり",z')).toEqual([
      ["a", "b"],
      ["x,1", 'say "hi"'],
      ["改行\nあり", "z"],
    ]);
  });
  it("書き出したものを読み戻せる", () => {
    const rows = [["試験", "内容"], ["謎検", '第1章, "基礎"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("日付は - と /（Excelの書き換え）の両方を受け付ける", () => {
    expect(normalizeDate("2026-11-15")).toBe("2026-11-15");
    expect(normalizeDate("2026/1/5")).toBe("2026-01-05");
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("11/15")).toBeNull();
  });
});

describe("計画CSVのチェック", () => {
  it("仕様の例の行は問題なし", () => {
    const { rows } = checkPlanCsv(`﻿${header}\n中小企業診断士,財務・会計,〇〇テキスト,第3章,45,80,2026-11-15,2026-11-20\n`, ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 2, start_page: 45, end_page: 80, errors: [], notes: [], duplicate: false });
  });
  it("不正な行はエラー", () => {
    const { rows } = checkPlanCsv(
      [
        header,
        "中小企業診断士,財務・会計,〇〇テキスト,A,45,80,2026-13-01,2026-11-20", // 日付不正
        "中小企業診断士,財務・会計,〇〇テキスト,B,45,80,2026-11-21,2026-11-20", // 開始日＞終了日
        "中小企業診断士,財務・会計,〇〇テキスト,C,90,80,2026-11-15,2026-11-20", // 開始ページ＞終了ページ
        "簿記,商業簿記,テキスト,D,1,10,2026-11-15,2026-11-20", // 未登録の取り組み
      ].join("\n"),
      ctx,
    );
    expect(rows.map((r) => r.errors.length > 0)).toEqual([true, true, true, true]);
    expect(rows[0].errors[0]).toContain("開始日");
    expect(rows[1].errors[0]).toContain("開始日が終了日より後");
    expect(rows[2].errors[0]).toContain("開始ページが終了ページより後");
    expect(rows[3].errors[0]).toContain("登録されていません");
  });
  it("未登録の科目・教材は「新規作成されます」", () => {
    const { rows } = checkPlanCsv(`${header}\n中小企業診断士,企業経営理論,新テキスト,第1章,1,30,2026/11/15,2026/11/20`, ctx);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].notes).toEqual(["科目「企業経営理論」は新規作成されます", "教材「新テキスト」は新規作成されます"]);
    expect(rows[0].start_date).toBe("2026-11-15");
  });
  it("登録済みの計画と同じ行は重複として印を付ける", () => {
    const row = { exam: "中小企業診断士", subject: "財務・会計", material: "〇〇テキスト", content: "第3章", start_page: 45, end_page: 80, start_date: "2026-11-15", end_date: "2026-11-20" };
    const { rows } = checkPlanCsv(`${header}\n中小企業診断士,財務・会計,〇〇テキスト,第3章,45,80,2026-11-15,2026-11-20`, {
      ...ctx,
      existingKeys: new Set([planKey(row)]),
    });
    expect(rows[0].duplicate).toBe(true);
  });
  it("空のファイル", () => {
    expect(checkPlanCsv("", ctx).fileError).not.toBeNull();
    expect(checkPlanCsv(header, ctx).fileError).not.toBeNull();
  });
});
