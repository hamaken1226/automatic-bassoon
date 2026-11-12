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

// ---- お金 ----

export type PlaceKind = "bank" | "cash" | "emoney" | "credit";
export type TxType = "expense" | "income" | "transfer" | "adjustment" | "loan_collection";
export type CollectMethod = "paypay" | "bank" | "cash";

export type MoneyPlace = Row & { name: string; kind: PlaceKind; initial_balance: number; sort_order: number };

export type MoneyCategory = Row & { name: string; direction: "expense" | "income"; sort_order: number };

export type MoneyTx = Row & {
  type: TxType;
  date: string;
  amount: number; // 自分の計上額（調整は符号付き）
  total_amount: number | null; // まとめ払いの全額
  place_id: string;
  to_place_id: string | null;
  category_id: string | null;
  memo: string;
  is_suica_charge: boolean;
};

export type Loan = Row & {
  transaction_id: string;
  person: string;
  amount: number;
  status: "open" | "collected";
  collected_on: string | null;
  collected_method: CollectMethod | null;
  collected_transaction_id: string | null;
};

export type CardSetting = Row & {
  place_id: string;
  closing_day: number;
  payment_day: number;
  payment_month_offset: number;
  debit_place_id: string | null;
  check_day: number | null;
};

export type CardStatement = Row & {
  place_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  app_amount: number;
  actual_amount: number | null;
  status: "unchecked" | "matched" | "mismatched";
  payment_transaction_id: string | null;
};

export type BalanceCheckItem = Row & {
  balance_check_id: string;
  place_id: string;
  app_balance: number;
  actual_balance: number;
  diff: number;
};

export type BalanceCheck = Row & { checked_on: string; balance_check_items: BalanceCheckItem[] };

// ---- 謎解きメモ ----

export type NazoTag = Row & { name: string };

export type NazoIdea = Row & {
  title: string;
  body: string;
  answer: string | null;
  explanation: string | null;
  nazo_idea_tags: { tag_id: string }[];
};

export type NazoResult = "success" | "failure";
export type NazoFormat = "room" | "hall" | "walk" | "online" | "other";

export type NazoPerformance = Row & {
  title: string;
  organizer: string;
  attended_on: string | null;
  links: string[];
  review: string;
  result: NazoResult | null;
  rating: number | null;
  format: NazoFormat | null;
  companions: string | null;
};

export type NazoGimmick = Row & { title: string; memo: string };

// ---- IELTS ----

export type IeltsDetails = {
  // Reading / Listening
  difficulty?: number | null;
  correct?: number | null;
  total?: number | null;
  // Writing
  task?: 1 | 2;
  prompt?: string;
  essay?: string;
  task_response?: number | null;
  coherence_cohesion?: number | null;
  lexical_resource?: number | null;
  grammar?: number | null;
  feedback?: string;
  // Speaking
  part?: string;
  question?: string;
  fluency?: number | null;
  speaking_lexical?: number | null;
  speaking_grammar?: number | null;
  pronunciation?: number | null;
  wpm?: number | null;
  fillers?: number | null;
  pauses?: number | null;
  recorded_at?: string;
};

export type IeltsRecord = Row & {
  skill: "listening" | "reading" | "writing" | "speaking";
  date: string;
  source: string;
  band: number | null;
  minutes: number | null;
  notes: string;
  details: IeltsDetails;
  import_filename: string | null;
  attendance_record_id: string | null;
};
