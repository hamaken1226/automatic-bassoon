"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { primaryButton, secondaryButton } from "@/components/ui/styles";
import { toCsv } from "@/lib/csv";
import { todayJst } from "@/lib/date";
import { checkPlanCsv, PLAN_CSV_HEADER, planKey, type PlanCsvContext, type PlanCsvRow } from "@/lib/plan-csv";
import type { StudyData } from "@/lib/study";
import type { StudyStore } from "@/lib/use-study";
import type { Plan } from "@/lib/types";
import { ErrorNote } from "./shared";

/** 計画をCSVの1行分の値にする */
function planToRow(plan: Plan, data: StudyData) {
  const subject = data.subjects.find((s) => s.id === plan.subject_id);
  const material = data.materials.find((m) => m.id === plan.material_id);
  const exam = data.initiatives.find((i) => i.id === subject?.initiative_id);
  return {
    exam: exam?.name ?? "",
    subject: subject?.name ?? "",
    material: material?.name ?? "",
    content: plan.content,
    start_page: plan.start_page,
    end_page: plan.end_page,
    start_date: plan.start_date,
    end_date: plan.end_date,
  };
}

/** 現在の計画を、取り込みと同じ形式のCSVで書き出す */
export function PlanCsvExportButton({ data, children }: { data: StudyData; children: ReactNode }) {
  const download = () => {
    const rows = data.plans.map((p) => {
      const r = planToRow(p, data);
      return [r.exam, r.subject, r.material, r.content, r.start_page, r.end_page, r.start_date, r.end_date];
    });
    const blob = new Blob([toCsv([PLAN_CSV_HEADER, ...rows])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `計画_${todayJst()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={download} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
      {children}
    </button>
  );
}

/** CSV取り込み: ファイルを選ぶ → 行ごとのチェック結果をプレビュー → 取り込む */
export function PlanCsvImport({ data, store, onClose }: { data: StudyData; store: StudyStore; onClose: () => void }) {
  const [rows, setRows] = useState<PlanCsvRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const ctx = useMemo<PlanCsvContext>(
    () => ({
      exams: data.initiatives
        .filter((i) => i.type === "exam")
        .map((i) => ({
          name: i.name,
          subjects: data.subjects
            .filter((s) => s.initiative_id === i.id)
            .map((s) => ({
              name: s.name,
              materials: data.materials.filter((m) => m.subject_id === s.id).map((m) => m.name),
            })),
        })),
      existingKeys: new Set(data.plans.map((p) => planKey(planToRow(p, data)))),
    }),
    [data],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    // UTF-8として読む（BOM付きでもよい）
    const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    const checked = checkPlanCsv(text, ctx);
    setError(checked.fileError);
    setRows(checked.fileError ? null : checked.rows);
  };

  const errorRows = rows?.filter((r) => r.errors.length > 0) ?? [];
  const validRows = rows?.filter((r) => r.errors.length === 0) ?? [];
  // 「追加」では登録済みと同じ行を飛ばす。「置き換え」では全部入れ直す
  const targets = mode === "add" ? validRows.filter((r) => !r.duplicate) : validRows;

  const apply = async () => {
    setBusy(true);
    setError(null);
    const { sb } = store;
    try {
      const fail = (e: { message: string } | null) => {
        if (e) throw new Error(e.message);
      };
      const examId = (name: string) => data.initiatives.find((i) => i.type === "exam" && i.name === name)!.id;

      if (mode === "replace") {
        // CSVに含まれる試験の、既存の計画を消してから入れ直す
        const examIds = new Set(validRows.map((r) => examId(r.exam)));
        const subjectIds = data.subjects.filter((s) => examIds.has(s.initiative_id)).map((s) => s.id);
        if (subjectIds.length > 0) fail((await sb.from("plans").delete().in("subject_id", subjectIds)).error);
      }

      // 未登録の科目・教材を作る
      const subjectIds = new Map<string, string>(); // 「試験ID/科目名」→ 科目ID
      for (const s of data.subjects) subjectIds.set(`${s.initiative_id}/${s.name}`, s.id);
      const materialIds = new Map<string, string>(); // 「科目ID/教材名」→ 教材ID
      for (const m of data.materials) materialIds.set(`${m.subject_id}/${m.name}`, m.id);

      for (const r of targets) {
        const sKey = `${examId(r.exam)}/${r.subject}`;
        if (!subjectIds.has(sKey)) {
          const res = await sb.from("subjects").insert({ initiative_id: examId(r.exam), name: r.subject, sort_order: subjectIds.size }).select("id").single();
          fail(res.error);
          subjectIds.set(sKey, (res.data as { id: string }).id);
        }
        const mKey = `${subjectIds.get(sKey)}/${r.material}`;
        if (!materialIds.has(mKey)) {
          const res = await sb.from("materials").insert({ subject_id: subjectIds.get(sKey), name: r.material }).select("id").single();
          fail(res.error);
          materialIds.set(mKey, (res.data as { id: string }).id);
        }
      }

      if (targets.length > 0) {
        fail(
          (
            await sb.from("plans").insert(
              targets.map((r) => {
                const subjectId = subjectIds.get(`${examId(r.exam)}/${r.subject}`)!;
                return {
                  subject_id: subjectId,
                  material_id: materialIds.get(`${subjectId}/${r.material}`)!,
                  content: r.content,
                  start_page: r.start_page,
                  end_page: r.end_page,
                  start_date: r.start_date,
                  end_date: r.end_date,
                };
              }),
            )
          ).error,
        );
      }
      await store.reload();
      setRows(null);
      setResult(`${targets.length}件の計画を取り込みました`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込めませんでした");
      await store.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="計画のCSVを取り込む"
      onClose={onClose}
      className="md:max-w-4xl"
      footer={
        rows ? (
          <>
            <span className="flex-1 text-xs text-muted">
              取り込む行: {targets.length}件
              {errorRows.length > 0 && ` / エラー: ${errorRows.length}件`}
            </span>
            <button type="button" onClick={onClose} className={secondaryButton}>
              中止
            </button>
            <button type="button" onClick={apply} disabled={busy || targets.length === 0} className={primaryButton}>
              {busy ? "取り込み中…" : errorRows.length > 0 ? "エラーの行を除いて取り込む" : "取り込む"}
            </button>
          </>
        ) : (
          <>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className={secondaryButton}>
              閉じる
            </button>
          </>
        )
      }
    >
      <ErrorNote error={error} />
      {result && (
        <p role="status" className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          {result}
        </p>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-muted">CSVファイル（UTF-8。Excelで保存したファイルも読めます）</span>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSVファイル"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            // 同じ名前のファイルを選び直しても読み込めるようにする
            e.target.value = "";
          }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2"
        />
      </label>

      {rows && (
        <>
          <fieldset className="mt-4 space-y-1 text-sm">
            <legend className="mb-1 text-xs font-semibold text-muted">取り込み方</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} className="mt-1 accent-accent" />
              <span>追加する（登録済みと同じ計画は飛ばす）</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-1 accent-accent" />
              <span>
                置き換える（CSVに含まれる試験の既存の計画をすべて削除してから取り込む。
                スプレッドシートで編集して入れ直すとき用）
              </span>
            </label>
          </fieldset>

          <p className="mt-4 mb-1 text-xs font-semibold text-muted">
            プレビュー: {fileName}（{rows.length}行）
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-background text-xs text-muted">
                <tr>
                  {["行", ...PLAN_CSV_HEADER, "チェック結果"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t border-border align-top">
                    <td className="px-2 py-1.5 text-muted">{r.line}</td>
                    <td className="px-2 py-1.5">{r.exam}</td>
                    <td className="px-2 py-1.5">{r.subject}</td>
                    <td className="px-2 py-1.5">{r.material}</td>
                    <td className="px-2 py-1.5">{r.content}</td>
                    <td className="px-2 py-1.5">{r.start_page || ""}</td>
                    <td className="px-2 py-1.5">{r.end_page || ""}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{r.start_date}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{r.end_date}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.length > 0 ? (
                        <span className="text-danger">エラー: {r.errors.join(" / ")}</span>
                      ) : (
                        <>
                          {r.duplicate && mode === "add" ? (
                            <span className="text-muted">登録済み（飛ばします）</span>
                          ) : (
                            <span className="text-accent">OK</span>
                          )}
                          {r.notes.map((n) => (
                            <span key={n} className="block text-xs text-muted">
                              {n}
                            </span>
                          ))}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
