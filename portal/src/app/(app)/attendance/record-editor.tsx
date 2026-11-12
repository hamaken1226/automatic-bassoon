"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatMinutes, fromJstInput, toJstInput } from "@/lib/date";
import type { StudyData } from "@/lib/study";
import type { AttendanceKind, AttendanceRecord } from "@/lib/types";
import type { Act } from "./attendance-app";
import { DetailFields, detailValues, type Detail } from "./detail-fields";

/** 記録の手動追加と、開始・終了時刻の修正・削除（押し忘れ用） */
export function RecordEditor({
  record,
  kinds,
  data,
  sb,
  act,
  onClose,
}: {
  record: AttendanceRecord | null;
  kinds: AttendanceKind[];
  data: StudyData;
  sb: SupabaseClient;
  act: Act;
  onClose: () => void;
}) {
  // 新規は「1時間前〜今」を初期値にする
  const [initialNow] = useState(() => Date.now());
  const [kindId, setKindId] = useState(record?.kind_id ?? kinds[0]?.id ?? "");
  const [start, setStart] = useState(toJstInput(record?.started_at ?? new Date(initialNow - 3_600_000).toISOString()));
  const [end, setEnd] = useState(toJstInput(record?.ended_at ?? new Date(initialNow).toISOString()));
  const [detail, setDetail] = useState<Detail>({
    initiative_id: record?.initiative_id ?? "",
    subject_id: record?.subject_id ?? "",
    material_id: record?.material_id ?? "",
    song_id: record?.song_id ?? "",
  });
  const [page, setPage] = useState(record?.page_reached != null ? String(record.page_reached) : "");
  const [memo, setMemo] = useState(record?.memo ?? "");
  const [error, setError] = useState<string | null>(null);

  const kind = kinds.find((k) => k.id === kindId);
  const minutes = start && end ? (new Date(fromJstInput(end)).getTime() - new Date(fromJstInput(start)).getTime()) / 60_000 : null;

  const save = async () => {
    if (!kind) return setError("種類を選んでください");
    if (!start || !end) return setError("開始と終了の日時を入力してください");
    if (minutes === null || minutes < 0) return setError("終了が開始より前になっています");
    setError(null);
    const values = {
      kind_id: kind.id,
      started_at: fromJstInput(start),
      ended_at: fromJstInput(end),
      is_running: false,
      memo: memo.trim(),
      page_reached: kind.special === "study" && detail.material_id && page !== "" ? Math.max(0, Math.floor(Number(page))) : null,
      ...detailValues(kind, detail),
    };
    const ok = await act(async () => {
      const res = record
        ? await sb.from("attendance_records").update(values).eq("id", record.id)
        : await sb.from("attendance_records").insert(values);
      // ページを入力・変更したときは、勉強スケジュールの実績にも反映する
      if (res.error || values.page_reached === null || values.page_reached === record?.page_reached) return res;
      return sb.from("materials").update({ current_page: values.page_reached }).eq("id", values.material_id);
    });
    if (ok) onClose();
  };

  const remove = async () => {
    if (!record || !window.confirm("この記録を削除しますか？")) return;
    const ok = await act(() => sb.from("attendance_records").delete().eq("id", record.id));
    if (ok) onClose();
  };

  return (
    <Modal
      title={record ? "記録を修正" : "記録を手動で追加"}
      onClose={onClose}
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
          <button type="button" onClick={save} className={primaryButton}>
            保存
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <label className="block">
          <span className={labelClass}>種類</span>
          <select value={kindId} onChange={(e) => setKindId(e.target.value)} className={inputClass}>
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>開始</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>終了</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </label>
        </div>
        {minutes !== null && minutes >= 0 && <p className="text-sm text-muted">長さ: {formatMinutes(minutes)}</p>}
        <DetailFields kind={kind} data={data} value={detail} onChange={setDetail} />
        {kind?.special === "study" && detail.material_id && (
          <label className="block">
            <span className={labelClass}>何ページまで進んだか（任意）</span>
            <input type="number" min={0} inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} className={inputClass} />
          </label>
        )}
        <label className="block">
          <span className={labelClass}>メモ</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-16`} />
        </label>
      </div>
    </Modal>
  );
}
