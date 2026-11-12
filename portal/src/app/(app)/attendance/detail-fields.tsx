"use client";

import { inputClass, labelClass } from "@/components/ui/styles";
import type { StudyData } from "@/lib/study";
import type { AttendanceKind } from "@/lib/types";

export type Detail = {
  initiative_id: string;
  subject_id: string;
  material_id: string;
  song_id: string;
};

export const EMPTY_DETAIL: Detail = { initiative_id: "", subject_id: "", material_id: "", song_id: "" };

/** 種類に合わない項目を空にして、DBに入れる形（空は null）にする */
export function detailValues(kind: AttendanceKind | undefined, d: Detail) {
  const study = kind?.special === "study";
  const drum = kind?.special === "drum";
  return {
    initiative_id: study ? d.initiative_id || null : null,
    subject_id: study ? d.subject_id || null : null,
    material_id: study ? d.material_id || null : null,
    song_id: drum ? d.song_id || null : null,
  };
}

/** 種類が「勉強」なら取り組み・科目・教材、「ドラム」なら曲を選ぶ欄 */
export function DetailFields({
  kind,
  data,
  value,
  onChange,
}: {
  kind: AttendanceKind | undefined;
  data: StudyData;
  value: Detail;
  onChange: (value: Detail) => void;
}) {
  if (kind?.special === "study") {
    const exams = data.initiatives.filter((i) => i.type === "exam");
    const subjects = data.subjects.filter((s) => s.initiative_id === value.initiative_id);
    const materials = data.materials.filter((m) => m.subject_id === value.subject_id);
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={labelClass}>取り組み</span>
          <select
            value={value.initiative_id}
            onChange={(e) => onChange({ ...value, initiative_id: e.target.value, subject_id: "", material_id: "" })}
            className={inputClass}
          >
            <option value="">選択なし</option>
            {exams.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>科目</span>
          <select
            value={value.subject_id}
            disabled={!value.initiative_id}
            onChange={(e) => onChange({ ...value, subject_id: e.target.value, material_id: "" })}
            className={inputClass}
          >
            <option value="">選択なし</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>教材（任意）</span>
          <select
            value={value.material_id}
            disabled={!value.subject_id}
            onChange={(e) => onChange({ ...value, material_id: e.target.value })}
            className={inputClass}
          >
            <option value="">選択なし</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  if (kind?.special === "drum") {
    return (
      <label className="block">
        <span className={labelClass}>曲（任意）</span>
        <select value={value.song_id} onChange={(e) => onChange({ ...value, song_id: e.target.value })} className={inputClass}>
          <option value="">選択なし</option>
          {data.songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return null;
}
