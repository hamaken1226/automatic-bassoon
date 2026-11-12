"use client";

import { FileJson } from "lucide-react";
import { useRef, useState } from "react";
import { parseSpeakingSession } from "@/lib/speaking-import";
import type { IeltsStore } from "@/lib/use-ielts";

type Result = { imported: number; skipped: string[]; failed: { name: string; reason: string }[] };

/**
 * Speaking練習ツールの data/sessions/〇〇.json をドラッグ＆ドロップ（複数可）で取り込む。
 * 同じファイル名はすでに取り込んでいれば飛ばす。
 */
export function SpeakingImport({ store }: { store: IeltsStore }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const importFiles = async (files: File[]) => {
    const jsons = files.filter((f) => f.name.toLowerCase().endsWith(".json"));
    const result: Result = { imported: 0, skipped: [], failed: [] };
    for (const f of files) if (!jsons.includes(f)) result.failed.push({ name: f.name, reason: "JSONファイルではありません" });
    if (jsons.length === 0) return setResult(result);

    setBusy(true);
    const existing = new Set((store.data?.records ?? []).map((r) => r.import_filename).filter(Boolean));
    for (const file of jsons) {
      if (existing.has(file.name)) {
        result.skipped.push(file.name);
        continue;
      }
      try {
        const row = parseSpeakingSession(await file.text(), file.name);
        const { error } = await store.sb.from("ielts_records").insert({ skill: "speaking", minutes: null, ...row });
        if (error) {
          // 別の画面で同時に取り込んだ場合など
          if (error.code === "23505") result.skipped.push(file.name);
          else result.failed.push({ name: file.name, reason: error.message });
        } else {
          result.imported++;
          existing.add(file.name);
        }
      } catch (e) {
        result.failed.push({ name: file.name, reason: (e as Error).message });
      }
    }
    await store.reload();
    setBusy(false);
    setResult(result);
  };

  return (
    <section aria-label="ツールの結果を取り込む" className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">ツールの結果を取り込む</h2>
      <p className="mt-0.5 text-xs text-muted">ツールの data/sessions フォルダにある .json ファイル（複数可）。同じファイルは二重に取り込みません。</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          importFiles([...e.dataTransfer.files]);
        }}
        disabled={busy}
        className={`mt-3 flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-sm ${
          dragging ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"
        }`}
      >
        <FileJson className="size-6" aria-hidden />
        {busy ? "取り込み中…" : "ここにファイルをドロップ、またはタップして選ぶ"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        multiple
        aria-label="取り込むJSONファイル"
        className="hidden"
        onChange={(e) => {
          importFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {result && (
        <div role="status" className="mt-3 space-y-1 text-sm">
          <p>
            {result.imported}件を取り込みました
            {result.skipped.length > 0 && `・${result.skipped.length}件は取り込み済みのため飛ばしました`}
          </p>
          {result.failed.map((f) => (
            <p key={f.name} className="text-danger">
              {f.name}: {f.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
