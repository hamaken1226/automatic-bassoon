"use client";

import { Check, ExternalLink, ListChecks, Plus, Repeat, Tags } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { inputClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort, formatDateTime } from "@/lib/date";
import { findLinkTarget } from "@/lib/links";
import { describeRule } from "@/lib/recurrence";
import { getSupabase } from "@/lib/supabase/client";
import { completeTask, hasOpenSibling, reopenTask, TASK_SELECT } from "@/lib/tasks";
import { useToday } from "@/lib/use-today";
import type { TaskCategory, TaskWithDetails } from "@/lib/types";
import { CategoryManager } from "./category-manager";
import { TaskEditor } from "./task-editor";

type Tab = "open" | "done";

const byDue = (a: TaskWithDetails, b: TaskWithDetails) =>
  (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
  a.created_at.localeCompare(b.created_at);

export function TasksApp() {
  const sb = getSupabase();
  const today = useToday();
  const [tasks, setTasks] = useState<TaskWithDetails[] | null>(null);
  const [doneTasks, setDoneTasks] = useState<TaskWithDetails[] | null>(null);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [tab, setTab] = useState<Tab>("open");
  const [filter, setFilter] = useState<string>("all"); // "all" | "none" | カテゴリID
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");

  /** 失敗したら画面上部にエラーを出す */
  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    }
  }, []);

  const loadDone = useCallback(async () => {
    const { data, error } = await sb
      .from("tasks")
      .select(TASK_SELECT)
      .eq("status", "done")
      .order("completed_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    setDoneTasks(data as TaskWithDetails[]);
  }, [sb]);

  useEffect(() => {
    Promise.all([
      sb.from("task_categories").select("*").order("sort_order").order("created_at"),
      sb.from("tasks").select(TASK_SELECT).eq("status", "open"),
    ]).then(([cats, open]) => {
      const failed = cats.error ?? open.error;
      if (failed) return setError(failed.message);
      setCategories(cats.data as TaskCategory[]);
      setTasks(open.data as TaskWithDetails[]);
    });
  }, [sb]);

  const switchTab = (next: Tab) => {
    setTab(next);
    if (next === "done" && doneTasks === null) run(loadDone);
  };

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const matchesFilter = useCallback(
    (t: TaskWithDetails) =>
      filter === "all" || (filter === "none" ? !t.category_id : t.category_id === filter),
    [filter],
  );

  const sections = useMemo(() => {
    const list = (tasks ?? []).filter(matchesFilter).sort(byDue);
    return [
      { key: "overdue", label: "期限切れ", tasks: list.filter((t) => t.due_date && t.due_date < today) },
      { key: "today", label: "今日", tasks: list.filter((t) => t.due_date === today) },
      { key: "upcoming", label: "今後", tasks: list.filter((t) => t.due_date && t.due_date > today) },
      { key: "nodue", label: "期限なし", tasks: list.filter((t) => !t.due_date) },
    ];
  }, [tasks, matchesFilter, today]);

  const editing =
    tasks?.find((t) => t.id === editingId) ?? doneTasks?.find((t) => t.id === editingId) ?? null;

  const addTask = () =>
    run(async () => {
      const title = newTitle.trim();
      if (!title) return;
      const due = newDue;
      // 続けてすぐ次を入力できるよう、先に入力欄を空にする（失敗したら戻す）
      setNewTitle("");
      setNewDue("");
      const { data, error } = await sb
        .from("tasks")
        .insert({
          title,
          due_date: due || null,
          category_id: filter !== "all" && filter !== "none" ? filter : null,
        })
        .select(TASK_SELECT)
        .single();
      if (error) {
        setNewTitle(title);
        setNewDue(due);
        throw new Error(error.message);
      }
      setTasks((prev) => [...(prev ?? []), data as TaskWithDetails]);
    });

  const complete = (task: TaskWithDetails) =>
    run(async () => {
      const { completed, next } = await completeTask(sb, task);
      setTasks((prev) => [...(prev ?? []).filter((t) => t.id !== task.id), ...(next ? [next] : [])]);
      setDoneTasks((prev) => (prev ? [completed, ...prev] : prev));
    });

  const reopen = (task: TaskWithDetails) =>
    run(async () => {
      if (
        (await hasOpenSibling(sb, task)) &&
        !window.confirm(
          "この定期タスクは、すでに次の回が作られています。\n次の回を削除して、このタスクを未完了に戻しますか？",
        )
      ) {
        return;
      }
      const { reopened, removedId } = await reopenTask(sb, task);
      setDoneTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
      setTasks((prev) => [...(prev ?? []).filter((t) => t.id !== removedId), reopened]);
    });

  const onTaskChange = (task: TaskWithDetails) => {
    const replace = (list: TaskWithDetails[] | null) =>
      list ? list.map((t) => (t.id === task.id ? task : t)) : list;
    setTasks(replace);
    setDoneTasks(replace);
  };

  const onTaskDelete = (id: string) => {
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== id));
    setDoneTasks((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    setEditingId(null);
  };

  const renderTask = (task: TaskWithDetails) => {
    const category = task.category_id ? categoryById.get(task.category_id) : undefined;
    const doneCount = task.subtasks.filter((s) => s.done).length;
    const link = findLinkTarget(task.link_target);
    const isDone = task.status === "done";
    const overdue = !isDone && task.due_date !== null && task.due_date < today;
    return (
      <li key={task.id} className="flex items-start gap-1 border-b border-border last:border-b-0">
        <button
          type="button"
          aria-label={isDone ? `「${task.title}」を未完了に戻す` : `「${task.title}」を完了にする`}
          onClick={() => (isDone ? reopen(task) : complete(task))}
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <span
            className={`flex size-5 items-center justify-center rounded-full border-2 ${
              isDone ? "border-accent bg-accent text-accent-foreground" : "border-muted hover:border-accent"
            }`}
          >
            {isDone && <Check className="size-3.5" aria-hidden />}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setEditingId(task.id)}
          className="min-w-0 flex-1 py-2.5 pr-3 text-left"
        >
          <span className={`block break-words ${isDone ? "text-muted line-through" : ""}`}>
            {task.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {isDone && task.completed_at && <span>完了: {formatDateTime(task.completed_at)}</span>}
            {task.due_date && (
              <span className={overdue ? "font-semibold text-danger" : ""}>
                {task.due_date === today ? "今日" : formatDateShort(task.due_date, today)}
              </span>
            )}
            {category && (
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: category.color }} />
                {category.name}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3.5" aria-hidden />
                {doneCount}/{task.subtasks.length}
              </span>
            )}
            {task.task_recurrences && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3.5" aria-hidden />
                {describeRule(task.task_recurrences)}
              </span>
            )}
            {link && (
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="size-3.5" aria-hidden />
                {link.label}
              </span>
            )}
          </span>
        </button>
      </li>
    );
  };

  const chip = (value: string, label: string, color?: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
        filter === value ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border bg-card"
      }`}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );

  return (
    <>
      <PageHeader title="タスク" />

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* すぐ追加できる入力欄 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTask();
        }}
        className="mb-4 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3"
      >
        <input
          aria-label="新しいタスクのタイトル"
          placeholder="タスクを追加"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className={`${inputClass} min-w-0 flex-1 basis-56`}
        />
        <input
          type="date"
          aria-label="期限（任意）"
          value={newDue}
          onChange={(e) => setNewDue(e.target.value)}
          className={`${inputClass} !w-auto flex-1 sm:flex-none`}
        />
        <button type="submit" disabled={!newTitle.trim()} className={`${primaryButton} inline-flex items-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          追加
        </button>
      </form>

      <div className="mb-3 flex items-center justify-between gap-2">
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
          {(["open", "done"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => switchTab(t)}
              className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-accent-soft font-semibold text-accent" : "text-muted"}`}
            >
              {t === "open" ? "未完了" : "完了済み"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowCategories(true)} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
          <Tags className="size-4" aria-hidden />
          カテゴリ
        </button>
      </div>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {chip("all", "すべて")}
        {categories.map((c) => chip(c.id, c.name, c.color))}
        {categories.length > 0 && chip("none", "カテゴリなし")}
      </div>

      {tab === "open" ? (
        tasks === null || !today ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : sections.every((s) => s.tasks.length === 0) ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
            未完了のタスクはありません
          </p>
        ) : (
          <div className="space-y-5">
            {sections
              .filter((s) => s.tasks.length > 0)
              .map((s) => (
                <section key={s.key} aria-label={s.label}>
                  <h2 className={`mb-1.5 text-sm font-semibold ${s.key === "overdue" ? "text-danger" : "text-muted"}`}>
                    {s.label}
                    <span className="ml-2 font-normal">{s.tasks.length}</span>
                  </h2>
                  <ul className="rounded-xl border border-border bg-card">{s.tasks.map(renderTask)}</ul>
                </section>
              ))}
          </div>
        )
      ) : doneTasks === null ? (
        <p className="text-sm text-muted">読み込み中…</p>
      ) : doneTasks.filter(matchesFilter).length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          完了済みのタスクはありません
        </p>
      ) : (
        <ul className="rounded-xl border border-border bg-card">
          {doneTasks.filter(matchesFilter).map(renderTask)}
        </ul>
      )}

      {editing && (
        <TaskEditor
          key={editing.id}
          task={editing}
          categories={categories}
          onClose={() => setEditingId(null)}
          onChange={onTaskChange}
          onDelete={onTaskDelete}
        />
      )}

      {showCategories && (
        <CategoryManager
          categories={categories}
          onChange={setCategories}
          onDeleted={(id) => {
            // 削除したカテゴリが付いていたタスクは「カテゴリなし」になる
            const clear = (list: TaskWithDetails[] | null) =>
              list ? list.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)) : list;
            setTasks(clear);
            setDoneTasks(clear);
            if (filter === id) setFilter("all");
          }}
          onClose={() => setShowCategories(false)}
        />
      )}
    </>
  );
}
