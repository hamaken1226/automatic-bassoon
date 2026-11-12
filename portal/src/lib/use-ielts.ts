"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROMPTS, DEFAULT_TARGETS, SKILL_LABEL, type Skill, type Targets } from "./ielts";
import { ensureStudySeed, fetchAll } from "./study";
import { getSupabase } from "./supabase/client";
import type { AttendanceRecord, IeltsRecord, Initiative, Subject } from "./types";

export const TARGETS_KEY = "ielts_targets";
export const PROMPTS_KEY = "ielts_prompts";

export type Prompts = typeof DEFAULT_PROMPTS;

export type IeltsData = {
  records: IeltsRecord[];
  targets: Targets;
  prompts: Prompts;
  initiative: Initiative | null;
  subjects: Subject[];
  studyKindId: string | null;
  /** IELTSの取り組みに紐づく勤怠の記録 */
  attendance: Pick<AttendanceRecord, "started_at" | "ended_at" | "subject_id">[];
};

type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function loadSetting<T extends object>(sb: SupabaseClient, key: string, fallback: T): Promise<T> {
  const rows = check<{ value: Partial<T> }[]>(await sb.from("settings").select("value").eq("key", key));
  return { ...fallback, ...(rows[0]?.value ?? {}) };
}

export async function saveSetting(sb: SupabaseClient, key: string, value: unknown): Promise<void> {
  check(await sb.from("settings").upsert({ key, value }, { onConflict: "user_id,key" }));
}

async function loadIelts(sb: SupabaseClient): Promise<IeltsData> {
  const [records, targets, prompts, initiatives, kinds] = await Promise.all([
    fetchAll<IeltsRecord>((from, to) =>
      sb.from("ielts_records").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).range(from, to),
    ),
    loadSetting(sb, TARGETS_KEY, DEFAULT_TARGETS),
    loadSetting(sb, PROMPTS_KEY, DEFAULT_PROMPTS),
    sb.from("initiatives").select("*").eq("name", "IELTS").order("created_at"),
    sb.from("attendance_kinds").select("id, special").eq("special", "study").order("sort_order"),
  ]);
  const initiative = check<Initiative[]>(initiatives)[0] ?? null;
  const [subjects, attendance] = initiative
    ? await Promise.all([
        sb.from("subjects").select("*").eq("initiative_id", initiative.id).order("sort_order"),
        fetchAll<IeltsData["attendance"][number]>((from, to) =>
          sb.from("attendance_records").select("started_at, ended_at, subject_id").eq("initiative_id", initiative.id).range(from, to),
        ),
      ])
    : [{ data: [], error: null }, []];
  return {
    records,
    targets,
    prompts,
    initiative,
    subjects: check<Subject[]>(subjects as Res),
    studyKindId: check<{ id: string }[]>(kinds)[0]?.id ?? null,
    attendance,
  };
}

/** IELTSのデータを読み込んで持つ */
export function useIelts() {
  const sb = getSupabase();
  const [data, setData] = useState<IeltsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      // 勤怠の種類「勉強」と取り組み「IELTS」が先にできている必要がある
      await ensureStudySeed(sb);
      setData(await loadIelts(sb));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb]);

  useEffect(() => {
    Promise.resolve().then(reload);
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<void>): Promise<boolean> => {
      try {
        await fn();
        setError(null);
        await reload();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        await reload();
        return false;
      }
    },
    [reload],
  );

  return { sb, data, error, setError, reload, run };
}

export type IeltsStore = ReturnType<typeof useIelts>;

/**
 * かかった時間を勤怠に「勉強 / IELTS / 技能」として記録する（または更新・削除する）。
 * 戻り値は勤怠の記録のID（記録しないときは null）。
 */
export async function syncAttendance(
  sb: SupabaseClient,
  data: IeltsData,
  record: { skill: Skill; date: string; minutes: number | null; source: string; attendance_record_id: string | null },
  enabled: boolean,
  today: string,
): Promise<string | null> {
  const existing = record.attendance_record_id;
  if (enabled && record.minutes && record.minutes > 0 && !data.studyKindId) {
    throw new Error("勤怠の種類に「勉強」が無いため、勤怠に記録できませんでした（勤怠の「種類」で、記録時に取り組みを選ぶ種類を用意してください）");
  }
  if (!enabled || !record.minutes || record.minutes <= 0 || !data.studyKindId) {
    if (existing) check(await sb.from("attendance_records").delete().eq("id", existing));
    return null;
  }
  // 今日の記録なら「今」で終わる形に、別の日なら12:00から始まる形にする
  const end =
    record.date === today ? new Date() : new Date(new Date(`${record.date}T12:00:00+09:00`).getTime() + record.minutes * 60_000);
  const start = new Date(end.getTime() - record.minutes * 60_000);
  const values = {
    kind_id: data.studyKindId,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    is_running: false,
    initiative_id: data.initiative?.id ?? null,
    subject_id: data.subjects.find((s) => s.name === SKILL_LABEL[record.skill])?.id ?? null,
    memo: `IELTS ${SKILL_LABEL[record.skill]}${record.source ? `（${record.source}）` : ""}`,
    source: "ielts",
  };
  if (existing) {
    check(await sb.from("attendance_records").update(values).eq("id", existing));
    return existing;
  }
  return check<{ id: string }>(await sb.from("attendance_records").insert(values).select("id").single()).id;
}
