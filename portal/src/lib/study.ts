import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceKind, BandPractice, Initiative, Material, Plan, Song, Subject } from "./types";

export type StudyData = {
  initiatives: Initiative[];
  subjects: Subject[];
  materials: Material[];
  plans: Plan[];
  songs: Song[];
  bandPractices: BandPractice[];
};

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** 勤怠の種類の初期値。色は色覚の違いがあっても見分けやすい組み合わせ */
export const KIND_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

const SEED_KEY = "seed_study_v1";

/**
 * 初めて使うときに、初期データ（勤怠の種類・取り組み）を1回だけ作る。
 * 作成済みの印を settings に残すので、あとで削除しても復活しない。
 */
export async function ensureStudySeed(sb: SupabaseClient): Promise<void> {
  const done = check(await sb.from("settings").select("id").eq("key", SEED_KEY));
  if ((done as unknown[]).length > 0) return;
  // 先に印を付ける（2つの画面で同時に開いても二重に作らない）
  const flag = await sb.from("settings").insert({ key: SEED_KEY, value: true });
  if (flag.error) return;

  check(
    await sb.from("attendance_kinds").insert([
      { name: "勉強", special: "study", color: KIND_COLORS[0], sort_order: 0 },
      { name: "ドラム", special: "drum", color: KIND_COLORS[1], sort_order: 1 },
      { name: "仕事", special: "none", color: KIND_COLORS[2], sort_order: 2 },
    ]),
  );
  const initiatives = check(
    await sb
      .from("initiatives")
      .insert([
        { type: "exam", name: "謎検", exam_date: "2026-11-30", memo: "", sort_order: 0 },
        { type: "exam", name: "IELTS", exam_date: "2026-12-11", memo: "General Training", sort_order: 1 },
        { type: "exam", name: "中小企業診断士", exam_date: "2027-08-01", memo: "", sort_order: 2 },
        { type: "practice", name: "ドラム", exam_date: null, memo: "", sort_order: 3 },
      ])
      .select("id, name"),
  ) as { id: string; name: string }[];
  const ielts = initiatives.find((i) => i.name === "IELTS");
  if (ielts) {
    check(
      await sb.from("subjects").insert(
        ["Listening", "Reading", "Writing", "Speaking"].map((name, i) => ({
          initiative_id: ielts.id,
          name,
          sort_order: i,
        })),
      ),
    );
  }
}

export async function loadKinds(sb: SupabaseClient): Promise<AttendanceKind[]> {
  return check(
    await sb.from("attendance_kinds").select("*").order("sort_order").order("created_at"),
  ) as AttendanceKind[];
}

/** 取り組み・科目・教材・計画・曲・バンド練習をまとめて読み込む */
export async function loadStudyData(sb: SupabaseClient): Promise<StudyData> {
  const [initiatives, subjects, materials, plans, songs, bandPractices] = await Promise.all([
    sb.from("initiatives").select("*").order("sort_order").order("created_at"),
    sb.from("subjects").select("*").order("sort_order").order("created_at"),
    sb.from("materials").select("*").order("created_at"),
    sb.from("plans").select("*").order("start_date").order("start_page"),
    sb.from("songs").select("*").order("created_at"),
    sb.from("band_practices").select("*, band_practice_songs(song_id)").order("date"),
  ]);
  return {
    initiatives: check(initiatives) as Initiative[],
    subjects: check(subjects) as Subject[],
    materials: check(materials) as Material[],
    plans: check(plans) as Plan[],
    songs: check(songs) as Song[],
    bandPractices: check(bandPractices) as BandPractice[],
  };
}

/** 1000件を超えても全件読む（Supabaseは1回の取得が1000件まで） */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const rows = check(await query(from, from + size - 1)) as T[];
    all.push(...rows);
    if (rows.length < size) return all;
  }
}

/** 次のバンド練習（今日以降で最も近いもの） */
export function nextBandPractice(practices: BandPractice[], today: string): BandPractice | null {
  return practices.filter((p) => p.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}
