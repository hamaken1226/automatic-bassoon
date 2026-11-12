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
