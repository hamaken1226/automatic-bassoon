// データベースの行の型（supabase/migrations に対応）
import type { RuleType } from "./recurrence";

type Row = { id: string; user_id: string; created_at: string; updated_at: string };

export type TaskCategory = Row & { name: string; color: string; sort_order: number };

export type TaskRecurrence = Row & {
  rule_type: RuleType;
  weekdays: number[];
  day_of_month: number | null;
  interval_days: number | null;
  active: boolean;
};

export type Subtask = Row & { task_id: string; title: string; done: boolean; sort_order: number };

export type TaskLog = Row & { task_id: string; logged_at: string; body: string };

export type Task = Row & {
  title: string;
  body: string;
  category_id: string | null;
  due_date: string | null;
  status: "open" | "done";
  completed_at: string | null;
  link_target: string | null;
  recurrence_id: string | null;
};

/** 一覧用: サブタスクと繰り返し設定を一緒に読み込んだタスク */
export type TaskWithDetails = Task & {
  subtasks: Subtask[];
  task_recurrences: TaskRecurrence | null;
};

export type NoteItem = Row & { note_id: string; text: string; checked: boolean; sort_order: number };

export type NoteTag = Row & { name: string };

export type Note = Row & {
  title: string;
  body: string;
  kind: "text" | "checklist";
  color: string | null;
  pinned: boolean;
  archived: boolean;
  deleted_at: string | null;
};

/** 一覧用: チェックリストの項目とタグを一緒に読み込んだメモ */
export type NoteWithDetails = Note & {
  note_items: NoteItem[];
  note_tag_links: { tag_id: string }[];
};

// ---- 勤怠・勉強・ドラム ----

export type AttendanceKind = Row & {
  name: string;
  color: string;
  special: "study" | "drum" | "none";
  sort_order: number;
};

export type AttendanceRecord = Row & {
  kind_id: string;
  started_at: string;
  ended_at: string | null;
  is_running: boolean;
  initiative_id: string | null;
  subject_id: string | null;
  material_id: string | null;
  page_reached: number | null;
  song_id: string | null;
  memo: string;
  source: "manual" | "ielts";
};

export type Initiative = Row & {
  type: "exam" | "practice";
  name: string;
  exam_date: string | null;
  memo: string;
  sort_order: number;
};

export type Subject = Row & { initiative_id: string; name: string; sort_order: number };

export type Material = Row & {
  subject_id: string;
  name: string;
  total_pages: number | null;
  current_page: number;
};

export type Plan = Row & {
  subject_id: string;
  material_id: string;
  content: string;
  start_page: number;
  end_page: number;
  start_date: string;
  end_date: string;
};

export type Song = Row & { initiative_id: string; title: string; artist: string; memo: string };

export type BandPractice = Row & {
  initiative_id: string | null;
  date: string;
  place_memo: string;
  band_practice_songs: { song_id: string }[];
};

/** 日時付きのメモ（タスクの作業ログ・曲の練習ログ） */
export type LogEntry = Row & { logged_at: string; body: string };
