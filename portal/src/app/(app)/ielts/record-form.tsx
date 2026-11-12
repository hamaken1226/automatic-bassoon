"use client";

import { ClipboardPaste } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { todayJst } from "@/lib/date";
import { formatBand, num, parseIeltsResult, rawToBand, SKILL_LABEL, speakingBand, type Skill } from "@/lib/ielts";
import type { IeltsDetails, IeltsRecord } from "@/lib/types";
import { syncAttendance, type IeltsStore } from "@/lib/use-ielts";
import { ErrorNote } from "../study/shared";

type Fields = Record<string, string>;

const BAND_FIELDS: Record<"writing" | "speaking", { key: keyof IeltsDetails; label: string }[]> = {
  writing: [
    { key: "task_response", label: "Task Achievement / Response" },
    { key: "coherence_cohesion", label: "Coherence and Cohesion" },
    { key: "lexical_resource", label: "Lexical Resource" },
    { key: "grammar", label: "Grammatical Range and Accuracy" },
  ],
  speaking: [
    { key: "fluency", label: "Fluency & Coherence" },
    { key: "speaking_lexical", label: "Lexical Resource" },
    { key: "speaking_grammar", label: "Grammatical Range & Accuracy" },
    { key: "pronunciation", label: "Pronunciation" },
  ],
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** 記録の追加・編集。R/L/W は Claude の返答を貼り付けると各欄に自動入力する */
export function RecordForm({
  skill,
  record,
  store,
  onClose,
}: {
  skill: Skill;
  record: IeltsRecord | null;
  store: IeltsStore;
  onClose: () => void;
}) {
  const data = store.data!;
  const d = record?.details ?? {};
  const [date, setDate] = useState(record?.date ?? todayJst());
  const [source, setSource] = useState(record?.source ?? "");
  const [minutes, setMinutes] = useState(str(record?.minutes));
  const [toAttendance, setToAttendance] = useState(record ? !!record.attendance_record_id || !record.minutes : true);
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [f, setF] = useState<Fields>(() => {
    const init: Fields = {};
    for (const [k, v] of Object.entries(d)) init[k] = str(v);
    if (skill === "writing") init.task = str(d.task ?? 2);
    if (skill === "reading" || skill === "listening") init.total = str(d.total ?? 40);
    init.band = skill === "writing" ? str(record?.band) : "";
    return init;
  });
  const [paste, setPaste] = useState("");
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string) => (value: string) => setF((prev) => ({ ...prev, [key]: value }));

  // バンドの自動計算
  const autoBand =
    skill === "reading" || skill === "listening"
      ? num(f.correct) !== null && num(f.total) !== null
        ? rawToBand(skill, num(f.correct)!, num(f.total)!)
        : null
      : skill === "speaking"
        ? speakingBand(BAND_FIELDS.speaking.map((b) => num(f[b.key])))
        : num(f.band);

  const applyPaste = () => {
    const r = parseIeltsResult(paste);
    if (!r) return setPasteMessage("[IELTS-RESULT] のブロックが見つかりませんでした");
    const next = { ...f };
    const filled: string[] = [];
    const put = (key: string, value: string | undefined, label: string) => {
      if (value === undefined || value === "") return;
      next[key] = value;
      filled.push(label);
    };
    if (skill === "reading" || skill === "listening") {
      put("difficulty", r.difficulty, "難易度");
      put("correct", r.correct, "正答数");
      put("total", r.total, "問題数");
      if (r.comment && !notes.trim()) {
        setNotes(r.comment);
        filled.push("所感");
      }
    } else if (skill === "writing") {
      put("task", r.task?.replace(/\D/g, ""), "Task");
      put("band", r.overall, "総合バンド");
      put("task_response", r.task_response ?? r.task_achievement, "TA/TR");
      put("coherence_cohesion", r.coherence_cohesion, "CC");
      put("lexical_resource", r.lexical_resource, "LR");
      put("grammar", r.grammar, "GRA");
      put("feedback", r.feedback, "フィードバック");
    }
    setF(next);
    setPasteMessage(filled.length > 0 ? `自動入力しました: ${filled.join("・")}` : "読み取れる項目がありませんでした");
  };

  const save = async () => {
    if (!date) return setError("日付を入力してください");
    const minutesValue = minutes.trim() === "" ? null : num(minutes);
    if (minutesValue !== null && !(minutesValue >= 0)) return setError("かかった時間を正しく入力してください");
    const details: IeltsDetails = {};
    const numKeys =
      skill === "reading" || skill === "listening"
        ? ["difficulty", "correct", "total"]
        : skill === "writing"
          ? BAND_FIELDS.writing.map((b) => b.key)
          : [...BAND_FIELDS.speaking.map((b) => b.key), "wpm", "fillers", "pauses"];
    for (const k of numKeys) {
      if (f[k]?.trim()) {
        const v = num(f[k]);
        if (v === null) return setError(`「${k}」の値を数字で入力してください`);
        (details as Record<string, unknown>)[k] = v;
      }
    }
    if (skill === "reading" || skill === "listening") {
      const c = details.correct;
      const t = details.total;
      if (c != null && t != null && (c > t || t <= 0)) return setError("正答数が問題数を超えています");
    }
    if (skill === "writing") {
      details.task = f.task === "1" ? 1 : 2;
      details.prompt = f.prompt ?? "";
      details.essay = f.essay ?? "";
      details.feedback = f.feedback ?? "";
    }
    if (skill === "speaking") {
      details.part = f.part ?? "";
      details.question = f.question ?? "";
      if (d.recorded_at) details.recorded_at = d.recorded_at;
    }
    const band = autoBand;
    if (band !== null && (band < 0 || band > 9)) return setError("バンドは0〜9で入力してください");

    setBusy(true);
    const ok = await store.run(async () => {
      const today = todayJst();
      const attendanceId = await syncAttendance(
        store.sb,
        data,
        { skill, date, minutes: minutesValue, source: source.trim(), attendance_record_id: record?.attendance_record_id ?? null },
        toAttendance,
        today,
      );
      const values = {
        skill,
        date,
        source: source.trim(),
        band,
        minutes: minutesValue,
        notes: notes.trim(),
        details,
        attendance_record_id: attendanceId,
      };
      const res = record
        ? await store.sb.from("ielts_records").update(values).eq("id", record.id)
        : await store.sb.from("ielts_records").insert(values);
      if (res.error) throw new Error(res.error.message);
    });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!record || !window.confirm("この記録を削除しますか？\n勤怠に自動で記録した分も削除されます。")) return;
    const ok = await store.run(async () => {
      if (record.attendance_record_id) {
        const res = await store.sb.from("attendance_records").delete().eq("id", record.attendance_record_id);
        if (res.error) throw new Error(res.error.message);
      }
      const res = await store.sb.from("ielts_records").delete().eq("id", record.id);
      if (res.error) throw new Error(res.error.message);
    });
    if (ok) onClose();
  };

  const field = (key: string, label: string, opts: { numeric?: boolean; placeholder?: string } = {}) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        inputMode={opts.numeric ? "decimal" : undefined}
        placeholder={opts.placeholder}
        aria-label={label}
        value={f[key] ?? ""}
        onChange={(e) => set(key)(e.target.value)}
        className={inputClass}
      />
    </label>
  );
  const area = (key: string, label: string, min = "min-h-24") => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea aria-label={label} value={f[key] ?? ""} onChange={(e) => set(key)(e.target.value)} className={`${inputClass} [field-sizing:content] ${min}`} />
    </label>
  );

  return (
    <Modal
      title={`${SKILL_LABEL[skill]}の${record ? "記録" : "記録を追加"}`}
      onClose={onClose}
      className="md:max-w-2xl"
      footer={
        <>
          {record && (
            <button type="button" onClick={remove} className={dangerButton}>
              削除
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={save} disabled={busy} className={primaryButton}>
            {busy ? "保存中…" : "保存"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error ?? store.error} />

        {skill !== "speaking" && (
          <section aria-label="Claudeの返答を貼り付け" className="rounded-lg border border-border p-3">
            <label className="block">
              <span className={labelClass}>Claudeの返答を貼り付け（[IELTS-RESULT] を読み取って各欄に入れます）</span>
              <textarea
                aria-label="Claudeの返答"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="[IELTS-RESULT]&#10;skill: …"
                className={`${inputClass} [field-sizing:content] min-h-16 font-mono text-sm`}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={applyPaste} disabled={!paste.trim()} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
                <ClipboardPaste className="size-4" aria-hidden />
                読み取る
              </button>
              {pasteMessage && (
                <span role="status" className="text-sm text-muted">
                  {pasteMessage}
                </span>
              )}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>日付</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>かかった時間（分）</span>
            <input inputMode="numeric" aria-label="かかった時間（分）" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={toAttendance} onChange={(e) => setToAttendance(e.target.checked)} className="size-5 accent-accent" />
          かかった時間を勤怠に「勉強 / IELTS / {SKILL_LABEL[skill]}」として記録する
        </label>
        <label className="block">
          <span className={labelClass}>使った練習ページ・教材</span>
          <input aria-label="使った練習ページ・教材" value={source} onChange={(e) => setSource(e.target.value)} className={inputClass} />
        </label>

        {(skill === "reading" || skill === "listening") && (
          <div className="grid grid-cols-3 gap-3">
            {field("correct", "正答数", { numeric: true })}
            {field("total", "問題数", { numeric: true })}
            {field("difficulty", "難易度（Claude判定）", { numeric: true, placeholder: "6.5" })}
          </div>
        )}

        {skill === "writing" && (
          <>
            <fieldset>
              <legend className={labelClass}>Task</legend>
              <div role="radiogroup" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
                {["1", "2"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={f.task === t}
                    onClick={() => set("task")(t)}
                    className={`rounded-md px-4 py-1.5 ${f.task === t ? "bg-accent-soft font-semibold text-accent" : "text-muted"}`}
                  >
                    Task {t}
                  </button>
                ))}
              </div>
            </fieldset>
            {area("prompt", "お題", "min-h-16")}
            {area("essay", "自分の解答文", "min-h-32")}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {field("band", "総合バンド", { numeric: true })}
              {BAND_FIELDS.writing.map((b) => (
                <div key={b.key}>{field(b.key, f.task === "1" && b.key === "task_response" ? "Task Achievement" : b.key === "task_response" ? "Task Response" : b.label, { numeric: true })}</div>
              ))}
            </div>
            {area("feedback", "フィードバック", "min-h-24")}
          </>
        )}

        {skill === "speaking" && (
          <>
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              {field("part", "Part")}
              {field("question", "質問")}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BAND_FIELDS.speaking.map((b) => (
                <div key={b.key}>{field(b.key, b.label, { numeric: true })}</div>
              ))}
            </div>
            <p className="-mt-2 text-xs text-muted">Pronunciationはツールでは評価しないので、italkiなどの結果があれば入力してください</p>
            <div className="grid grid-cols-3 gap-3">
              {field("wpm", "WPM", { numeric: true })}
              {field("fillers", "フィラー回数", { numeric: true })}
              {field("pauses", "1秒以上の沈黙", { numeric: true })}
            </div>
          </>
        )}

        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          バンド: <span className="font-bold">{formatBand(autoBand)}</span>
          {(skill === "reading" || skill === "listening") && <span className="ml-2 text-xs">（正答数から換算した目安）</span>}
          {skill === "speaking" && <span className="ml-2 text-xs">（入力されている観点の平均）</span>}
        </p>

        <label className="block">
          <span className={labelClass}>所感</span>
          <textarea aria-label="所感" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-16`} />
        </label>
      </div>
    </Modal>
  );
}
