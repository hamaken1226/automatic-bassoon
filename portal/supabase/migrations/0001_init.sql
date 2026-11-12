-- 自己管理ポータル: 全テーブルの作成とRow Level Security（フェーズ1）
-- Supabaseの SQL Editor に貼り付けて実行する。
-- すべてのテーブルに id / user_id / created_at / updated_at を持たせ、
-- 本人（auth.uid() = user_id）のデータだけ読み書きできるようにする。

-- ============================================================
-- タスク
-- ============================================================
create table task_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#6b6b66',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rule_type text not null check (rule_type in ('daily', 'weekly', 'monthly', 'interval')),
  weekdays smallint[] not null default '{}',          -- 0=日 〜 6=土（weekly用、複数可）
  day_of_month smallint check (day_of_month between 1 and 31), -- monthly用。存在しない日は月末扱い
  interval_days integer check (interval_days >= 1),   -- interval用（◯日ごと）
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  category_id uuid references task_categories (id) on delete set null,
  due_date date,                                      -- 日付のみ（時刻は持たない）
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  link_target text,                                   -- 機能リンク（例: 'money_check'）
  recurrence_id uuid references task_recurrences (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_status_due_idx on tasks (user_id, status, due_date);
-- 1つの繰り返し設定につき、未完了のタスクは常に1つだけ
create unique index tasks_one_open_per_recurrence
  on tasks (recurrence_id) where status = 'open' and recurrence_id is not null;

create table subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subtasks_task_idx on subtasks (task_id);

create table task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  logged_at timestamptz not null default now(),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_logs_task_idx on task_logs (task_id, logged_at desc);

-- ============================================================
-- メモ
-- ============================================================
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  kind text not null default 'text' check (kind in ('text', 'checklist')),
  color text,
  pinned boolean not null default false,
  archived boolean not null default false,
  deleted_at timestamptz,                             -- ゴミ箱に入れた日時（7日後に完全削除）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_list_idx on notes (user_id, deleted_at, archived, pinned);

create table note_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid not null references notes (id) on delete cascade,
  text text not null default '',
  checked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index note_items_note_idx on note_items (note_id);

create table note_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table note_tag_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid not null references notes (id) on delete cascade,
  tag_id uuid not null references note_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (note_id, tag_id)
);
create index note_tag_links_tag_idx on note_tag_links (tag_id);

-- ============================================================
-- お金
-- ============================================================
create table money_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bank', 'cash', 'emoney', 'credit')),
  initial_balance integer not null default 0,         -- 円。creditは未払い額
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table money_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  direction text not null check (direction in ('expense', 'income')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, direction, name)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer', 'adjustment')),
  date date not null,
  amount integer not null,                            -- 自分の計上額（円）
  total_amount integer,                               -- まとめ払いの全額（まとめ払いのときだけ）
  place_id uuid not null references money_places (id) on delete restrict,
  to_place_id uuid references money_places (id) on delete restrict, -- 振替の移動先
  category_id uuid references money_categories (id) on delete set null,
  memo text not null default '',
  is_suica_charge boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transactions_date_idx on transactions (user_id, date desc);
create index transactions_place_idx on transactions (place_id, date);
create index transactions_to_place_idx on transactions (to_place_id, date);

create table loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references transactions (id) on delete cascade,
  person text not null,
  amount integer not null check (amount > 0),
  status text not null default 'open' check (status in ('open', 'collected')),
  collected_on date,
  collected_method text check (collected_method in ('paypay', 'bank', 'cash')),
  collected_transaction_id uuid references transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loans_transaction_idx on loans (transaction_id);
create index loans_status_idx on loans (user_id, status);

create table card_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id uuid not null unique references money_places (id) on delete cascade,
  closing_day smallint not null check (closing_day between 1 and 31), -- 31 = 末日
  payment_day smallint not null check (payment_day between 1 and 31),
  payment_month_offset smallint not null default 1 check (payment_month_offset in (1, 2)), -- 1=翌月 2=翌々月
  debit_place_id uuid references money_places (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  place_id uuid not null references money_places (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  app_amount integer not null default 0,
  actual_amount integer,
  status text not null default 'unchecked' check (status in ('unchecked', 'matched', 'mismatched')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, period_end)
);

create table balance_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checked_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table balance_check_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  balance_check_id uuid not null references balance_checks (id) on delete cascade,
  place_id uuid not null references money_places (id) on delete cascade,
  app_balance integer not null,
  actual_balance integer not null,
  diff integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index balance_check_items_check_idx on balance_check_items (balance_check_id);

-- ============================================================
-- 勤怠・勉強・ドラム
-- ============================================================
create table initiatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('exam', 'practice')),
  name text not null,
  exam_date date,
  memo text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  initiative_id uuid not null references initiatives (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (initiative_id, name)
);

create table materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references subjects (id) on delete cascade,
  name text not null,
  total_pages integer,
  current_page integer not null default 0,            -- 実績のページ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, name)
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references subjects (id) on delete cascade,
  material_id uuid not null references materials (id) on delete cascade,
  content text not null default '',
  start_page integer not null,
  end_page integer not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_page <= end_page),
  check (start_date <= end_date)
);
create index plans_dates_idx on plans (user_id, start_date, end_date);

create table songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  initiative_id uuid not null references initiatives (id) on delete cascade,
  title text not null,
  artist text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table song_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null references songs (id) on delete cascade,
  logged_at timestamptz not null default now(),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index song_logs_song_idx on song_logs (song_id, logged_at desc);

create table band_practices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  initiative_id uuid references initiatives (id) on delete cascade,
  date date not null,
  place_memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table band_practice_songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  band_practice_id uuid not null references band_practices (id) on delete cascade,
  song_id uuid not null references songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (band_practice_id, song_id)
);

create table attendance_kinds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#2f6f5e',
  special text not null default 'none' check (special in ('study', 'drum', 'none')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind_id uuid not null references attendance_kinds (id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz,
  is_running boolean not null default false,
  initiative_id uuid references initiatives (id) on delete set null,
  subject_id uuid references subjects (id) on delete set null,
  material_id uuid references materials (id) on delete set null,
  page_reached integer,
  song_id uuid references songs (id) on delete set null,
  memo text not null default '',
  source text not null default 'manual' check (source in ('manual', 'ielts')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index attendance_records_started_idx on attendance_records (user_id, started_at desc);
-- 同時に記録できるのは1件だけ
create unique index attendance_one_running on attendance_records (user_id) where is_running;

-- ============================================================
-- 謎解きメモ
-- ============================================================
create table nazo_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  answer text,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nazo_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table nazo_idea_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idea_id uuid not null references nazo_ideas (id) on delete cascade,
  tag_id uuid not null references nazo_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, tag_id)
);
create index nazo_idea_tags_tag_idx on nazo_idea_tags (tag_id);

create table nazo_performances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  organizer text not null default '',
  attended_on date,
  links text[] not null default '{}',
  review text not null default '',
  result text check (result in ('success', 'failure')),
  rating smallint check (rating between 1 and 5),
  format text check (format in ('room', 'hall', 'walk', 'online', 'other')),
  companions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nazo_gimmicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- IELTS・設定
-- ============================================================
create table ielts_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  skill text not null check (skill in ('listening', 'reading', 'writing', 'speaking')),
  date date not null,
  source text not null default '',                    -- 使った練習ページ・教材
  band numeric(2, 1) check (band between 0 and 9),
  minutes integer check (minutes >= 0),
  notes text not null default '',
  details jsonb not null default '{}',                -- 技能ごとの項目
  import_filename text,                               -- Speaking取り込み用（二重取り込み防止）
  attendance_record_id uuid references attendance_records (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, import_filename)
);
create index ielts_records_skill_date_idx on ielts_records (user_id, skill, date desc);

create table settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ============================================================
-- 共通: updated_at の自動更新と Row Level Security
-- ============================================================
create function set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'task_categories', 'task_recurrences', 'tasks', 'subtasks',
    'task_logs', 'notes', 'note_items', 'note_tags',
    'note_tag_links', 'money_places', 'money_categories', 'transactions',
    'loans', 'card_settings', 'card_statements', 'balance_checks',
    'balance_check_items', 'initiatives', 'subjects', 'materials',
    'plans', 'songs', 'song_logs', 'band_practices',
    'band_practice_songs', 'attendance_kinds', 'attendance_records', 'nazo_ideas',
    'nazo_tags', 'nazo_idea_tags', 'nazo_performances', 'nazo_gimmicks',
    'ielts_records', 'settings'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    -- 本人のデータだけ読み書きできる（未ログインは何もできない）
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;
