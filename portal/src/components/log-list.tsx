"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { iconButton, inputClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateTime } from "@/lib/date";
import { getSupabase } from "@/lib/supabase/client";
import type { LogEntry } from "@/lib/types";

/**
 * 日時付きのメモを積み上げていく一覧（タスクの作業ログ・曲の練習ログで共通）。
 * 新しいものが上。後から編集・削除できる。
 */
export function LogList({
  table,
  parentColumn,
  parentId,
  label,
  placeholder,
}: {
  table: "task_logs" | "song_logs";
  parentColumn: "task_id" | "song_id";
  parentId: string;
  label: string;
  placeholder: string;
}) {
  const sb = getSupabase();
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sb.from(table)
      .select("*")
      .eq(parentColumn, parentId)
      .order("logged_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setLogs(data as LogEntry[]);
      });
  }, [sb, table, parentColumn, parentId]);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    const { data, error } = await sb
      .from(table)
      .insert({ [parentColumn]: parentId, body })
      .select("*")
      .single();
    if (error) return setError(error.message);
    setLogs((prev) => [data as LogEntry, ...(prev ?? [])]);
    setDraft("");
  };

  const save = async () => {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) return;
    const { error } = await sb.from(table).update({ body }).eq("id", editing.id);
    if (error) return setError(error.message);
    setLogs((prev) => (prev ?? []).map((l) => (l.id === editing.id ? { ...l, body } : l)));
    setEditing(null);
  };

  const remove = async (log: LogEntry) => {
    if (!window.confirm(`この${label}を削除しますか？`)) return;
    const { error } = await sb.from(table).delete().eq("id", log.id);
    if (error) return setError(error.message);
    setLogs((prev) => (prev ?? []).filter((l) => l.id !== log.id));
  };

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-end gap-2"
      >
        <textarea
          rows={1}
          aria-label={`${label}を追加`}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`${inputClass} [field-sizing:content] min-h-10`}
        />
        <button type="submit" disabled={!draft.trim()} className={`${secondaryButton} shrink-0`}>
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
                    aria-label={`${label}を編集`}
                    className={`${iconButton} size-7`}
                    onClick={() => setEditing({ id: log.id, body: log.body })}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" aria-label={`${label}を削除`} className={`${iconButton} size-7`} onClick={() => remove(log)}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </span>
              </div>
              {editing?.id === log.id ? (
                <div className="mt-1 space-y-2">
                  <textarea
                    aria-label={`${label}の内容`}
                    value={editing.body}
                    onChange={(e) => setEditing({ id: log.id, body: e.target.value })}
                    className={`${inputClass} [field-sizing:content] min-h-10`}
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" className={secondaryButton} onClick={() => setEditing(null)}>
                      キャンセル
                    </button>
                    <button type="button" className={primaryButton} onClick={save}>
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
    </div>
  );
}
