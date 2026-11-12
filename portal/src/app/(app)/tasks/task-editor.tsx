"use client";

import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  dangerButton,
  iconButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "@/components/ui/styles";
import { formatDateTime, todayJst, WEEKDAY_LABELS, weekdayOf } from "@/lib/date";
import { findLinkTarget, LINK_TARGETS } from "@/lib/links";
import type { RuleType } from "@/lib/recurrence";
import { getSupabase } from "@/lib/supabase/client";
import { TASK_SELECT } from "@/lib/tasks";
import type { Subtask, TaskCategory, TaskLog, TaskWithDetails } from "@/lib/types";

type Repeat = "none" | RuleType;

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: "none", label: "なし" },
  { value: "daily", label: "毎日" },
  { value: "weekly", label: "毎週" },
  { value: "monthly", label: "毎月" },
  { value: "interval", label: "◯日ごと" },
];

const bySort = (a: Subtask, b: Subtask) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** タスクの詳細・編集。サブタスクと作業ログはその場で保存、それ以外は「保存」で保存する */
export function TaskEditor({
  task,
  categories,
  onClose,
  onChange,
  onDelete,
}: {
  task: TaskWithDetails;
  categories: TaskCategory[];
  onClose: () => void;
  onChange: (task: TaskWithDetails) => void;
  onDelete: (id: string) => void;
}) {
  const sb = getSupabase();
  const rule = task.task_recurrences;
  const isDone = task.status === "done";

  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);
  const [due, setDue] = useState(task.due_date ?? "");
  const [categoryId, setCategoryId] = useState(task.category_id ?? "");
  const [linkTarget, setLinkTarget] = useState(task.link_target ?? "");
  const [repeat, setRepeat] = useState<Repeat>(rule?.rule_type ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(String(rule?.day_of_month ?? ""));
  const [intervalDays, setIntervalDays] = useState(String(rule?.interval_days ?? ""));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSubtask, setNewSubtask] = useState("");
  const [logs, setLogs] = useState<TaskLog[] | null>(null);
  const [newLog, setNewLog] = useState("");
  const [editingLog, setEditingLog] = useState<{ id: string; body: string } | null>(null);

  const subtasks = [...task.subtasks].sort(bySort);
  const link = findLinkTarget(task.link_target);

  useEffect(() => {
    sb.from("task_logs")
      .select("*")
      .eq("task_id", task.id)
      .order("logged_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setLogs(data as TaskLog[]);
      });
  }, [sb, task.id]);

  /** 入力欄の変更（未保存の印を付ける） */
  const edit =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setDirty(true);
    };

  const close = () => {
    if (dirty && !window.confirm("変更を保存せずに閉じますか？")) return;
    onClose();
  };

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) return setError("タイトルを入力してください");
    if (repeat !== "none" && !due) return setError("繰り返すタスクには期限を入れてください");
    if (repeat === "interval" && !(Number(intervalDays) >= 1)) {
      return setError("何日ごとに繰り返すかを入力してください");
    }
    setSaving(true);
    setError(null);
    try {
      let recurrenceId = task.recurrence_id;
      if (!isDone) {
        if (repeat !== "none") {
          const payload = {
            rule_type: repeat,
            // 曜日・日にちが未指定なら、期限の曜日・日にちを使う
            weekdays: repeat === "weekly" ? (weekdays.length ? weekdays : [weekdayOf(due)]) : [],
            day_of_month:
              repeat === "monthly"
                ? Math.min(31, Math.max(1, Number(dayOfMonth) || Number(due.slice(8, 10))))
                : null,
            interval_days: repeat === "interval" ? Math.floor(Number(intervalDays)) : null,
            active: true,
          };
          if (recurrenceId) {
            const { error } = await sb.from("task_recurrences").update(payload).eq("id", recurrenceId);
            if (error) throw new Error(error.message);
          } else {
            const { data, error } = await sb.from("task_recurrences").insert(payload).select("id").single();
            if (error) throw new Error(error.message);
            recurrenceId = (data as { id: string }).id;
          }
        } else if (recurrenceId) {
          // 繰り返しを停止する（過去の完了済みタスクは残る）
          const { error } = await sb.from("task_recurrences").delete().eq("id", recurrenceId);
          if (error) throw new Error(error.message);
          recurrenceId = null;
        }
      }
      const { data, error } = await sb
        .from("tasks")
        .update({
          title: trimmed,
          body,
          due_date: due || null,
          category_id: categoryId || null,
          link_target: linkTarget || null,
          recurrence_id: recurrenceId,
        })
        .eq("id", task.id)
        .select(TASK_SELECT)
        .single();
      if (error) throw new Error(error.message);
      onChange(data as TaskWithDetails);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const message =
      task.recurrence_id && !isDone
        ? `「${task.title}」を削除しますか？\n定期タスクのため、繰り返しも停止します。`
        : `「${task.title}」を削除しますか？`;
    if (!window.confirm(message)) return;
    if (task.recurrence_id && !isDone) {
      const { error } = await sb.from("task_recurrences").delete().eq("id", task.recurrence_id);
      if (error) return setError(error.message);
    }
    const { error } = await sb.from("tasks").delete().eq("id", task.id);
    if (error) return setError(error.message);
    onDelete(task.id);
  };

  // ---- サブタスク（その場で保存） ----
  const setSubtasks = (next: Subtask[]) => onChange({ ...task, subtasks: next });

  const addSubtask = async () => {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    const sortOrder = subtasks.reduce((max, s) => Math.max(max, s.sort_order), -1) + 1;
    const { data, error } = await sb
      .from("subtasks")
      .insert({ task_id: task.id, title: trimmed, sort_order: sortOrder })
      .select("*")
      .single();
    if (error) return setError(error.message);
    setSubtasks([...task.subtasks, data as Subtask]);
    setNewSubtask("");
  };

  const updateSubtask = async (id: string, patch: Partial<Pick<Subtask, "title" | "done">>) => {
    // 先に画面へ反映し、保存に失敗したら元に戻す
    const before = task.subtasks;
    setSubtasks(before.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await sb.from("subtasks").update(patch).eq("id", id);
    if (error) {
      setSubtasks(before);
      setError(error.message);
    }
  };

  const removeSubtask = async (subtask: Subtask) => {
    if (!window.confirm(`サブタスク「${subtask.title}」を削除しますか？`)) return;
    const { error } = await sb.from("subtasks").delete().eq("id", subtask.id);
    if (error) return setError(error.message);
    setSubtasks(task.subtasks.filter((s) => s.id !== subtask.id));
  };

  // ---- 作業ログ（その場で保存） ----
  const addLog = async () => {
    const trimmed = newLog.trim();
    if (!trimmed) return;
    const { data, error } = await sb
      .from("task_logs")
      .insert({ task_id: task.id, body: trimmed })
      .select("*")
      .single();
    if (error) return setError(error.message);
    setLogs((prev) => [data as TaskLog, ...(prev ?? [])]);
    setNewLog("");
  };

  const saveLog = async () => {
    if (!editingLog) return;
    const trimmed = editingLog.body.trim();
    if (!trimmed) return;
    const { error } = await sb.from("task_logs").update({ body: trimmed }).eq("id", editingLog.id);
    if (error) return setError(error.message);
    setLogs((prev) => (prev ?? []).map((l) => (l.id === editingLog.id ? { ...l, body: trimmed } : l)));
    setEditingLog(null);
  };

  const removeLog = async (log: TaskLog) => {
    if (!window.confirm("この作業ログを削除しますか？")) return;
    const { error } = await sb.from("task_logs").delete().eq("id", log.id);
    if (error) return setError(error.message);
    setLogs((prev) => (prev ?? []).filter((l) => l.id !== log.id));
  };

  return (
    <Modal
      title={isDone ? "タスク（完了済み）" : "タスク"}
      onClose={close}
      footer={
        <>
          <button type="button" onClick={remove} className={`${dangerButton} inline-flex items-center gap-1.5`}>
            <Trash2 className="size-4" aria-hidden />
            削除
          </button>
          <span className="flex-1" />
          <button type="button" onClick={close} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={save} disabled={saving} className={primaryButton}>
            {saving ? "保存中…" : "保存"}
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
          <span className={labelClass}>タイトル</span>
          <input value={title} onChange={(e) => edit(setTitle)(e.target.value)} className={inputClass} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>期限</span>
            <input type="date" value={due} onChange={(e) => edit(setDue)(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>カテゴリ</span>
            <select value={categoryId} onChange={(e) => edit(setCategoryId)(e.target.value)} className={inputClass}>
              <option value="">なし</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!isDone && (
          <fieldset>
            <legend className={labelClass}>繰り返し</legend>
            <select
              aria-label="繰り返し方"
              value={repeat}
              onChange={(e) => {
                const value = e.target.value as Repeat;
                edit(setRepeat)(value);
                if (value !== "none" && !due) setDue(todayJst());
              }}
              className={inputClass}
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {repeat === "weekly" && (
              <div className="mt-2 flex gap-1.5">
                {WEEKDAY_LABELS.map((label, d) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${label}曜日`}
                      onClick={() => edit(setWeekdays)(on ? weekdays.filter((w) => w !== d) : [...weekdays, d])}
                      className={`size-9 rounded-full border text-sm ${
                        on ? "border-accent bg-accent text-accent-foreground" : "border-border"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {repeat === "monthly" && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                毎月
                <input
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  aria-label="日にち"
                  placeholder={due ? String(Number(due.slice(8, 10))) : ""}
                  value={dayOfMonth}
                  onChange={(e) => edit(setDayOfMonth)(e.target.value)}
                  className={`${inputClass} w-20`}
                />
                日<span className="text-xs text-muted">（無い日は月末）</span>
              </label>
            )}
            {repeat === "interval" && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label="何日ごと"
                  value={intervalDays}
                  onChange={(e) => edit(setIntervalDays)(e.target.value)}
                  className={`${inputClass} w-20`}
                />
                日ごと
              </label>
            )}
            {repeat !== "none" && (
              <p className="mt-2 text-xs text-muted">完了したときに次の回が作られます（期限が過ぎても溜まりません）</p>
            )}
          </fieldset>
        )}

        <label className="block">
          <span className={labelClass}>本文</span>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => edit(setBody)(e.target.value)}
            className={`${inputClass} [field-sizing:content] min-h-20`}
          />
        </label>

        <section aria-label="サブタスク">
          <h3 className={labelClass}>
            サブタスク
            {subtasks.length > 0 && (
              <span className="ml-2 font-normal">
                {subtasks.filter((s) => s.done).length}/{subtasks.length}
              </span>
            )}
          </h3>
          <ul className="space-y-1">
            {subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`「${s.title}」を完了にする`}
                  checked={s.done}
                  onChange={(e) => updateSubtask(s.id, { done: e.target.checked })}
                  className="size-5 shrink-0 accent-accent"
                />
                <input
                  aria-label="サブタスク名"
                  defaultValue={s.title}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== s.title) updateSubtask(s.id, { title: v });
                    else e.target.value = s.title;
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none focus:border-accent ${
                    s.done ? "text-muted line-through" : ""
                  }`}
                />
                <button type="button" aria-label={`「${s.title}」を削除`} className={iconButton} onClick={() => removeSubtask(s)}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSubtask();
            }}
            className="mt-1 flex items-center gap-2"
          >
            <Plus className="size-5 shrink-0 text-muted" aria-hidden />
            <input
              aria-label="サブタスクを追加"
              placeholder="サブタスクを追加"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none focus:border-accent"
            />
            {newSubtask.trim() && (
              <button type="submit" className={secondaryButton}>
                追加
              </button>
            )}
          </form>
        </section>

        <div>
          <label className="block">
            <span className={labelClass}>機能リンク</span>
            <select value={linkTarget} onChange={(e) => edit(setLinkTarget)(e.target.value)} className={inputClass}>
              <option value="">なし</option>
              {LINK_TARGETS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {linkTarget === "money_check" && (
            <p className="mt-1 text-xs text-muted">月次チェックを完了すると、このタスクも自動で完了になります</p>
          )}
          {link && (
            <Link href={link.href} className="mt-2 inline-flex items-center gap-1 text-sm text-accent underline">
              <ExternalLink className="size-4" aria-hidden />
              {link.label}を開く
            </Link>
          )}
        </div>

        <section aria-label="作業ログ" className="border-t border-border pt-4">
          <h3 className={labelClass}>作業ログ</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addLog();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              rows={1}
              aria-label="作業ログを追加"
              placeholder="やったこと・気づいたことをメモ"
              value={newLog}
              onChange={(e) => setNewLog(e.target.value)}
              className={`${inputClass} [field-sizing:content] min-h-10`}
            />
            <button type="submit" disabled={!newLog.trim()} className={`${secondaryButton} shrink-0`}>
              記録
            </button>
          </form>
          {logs === null ? (
            <p className="mt-3 text-sm text-muted">読み込み中…</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {logs.map((log) => (
                <li key={log.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <time className="text-xs text-muted">{formatDateTime(log.logged_at)}</time>
                    <span className="flex">
                      <button
                        type="button"
                        aria-label="作業ログを編集"
                        className={`${iconButton} size-7`}
                        onClick={() => setEditingLog({ id: log.id, body: log.body })}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <button type="button" aria-label="作業ログを削除" className={`${iconButton} size-7`} onClick={() => removeLog(log)}>
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  </div>
                  {editingLog?.id === log.id ? (
                    <div className="mt-1 space-y-2">
                      <textarea
                        aria-label="作業ログの内容"
                        value={editingLog.body}
                        onChange={(e) => setEditingLog({ id: log.id, body: e.target.value })}
                        className={`${inputClass} [field-sizing:content] min-h-10`}
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" className={secondaryButton} onClick={() => setEditingLog(null)}>
                          キャンセル
                        </button>
                        <button type="button" className={primaryButton} onClick={saveLog}>
                          更新
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{log.body}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
