"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { iconButton, inputClass, primaryButton } from "@/components/ui/styles";
import { getSupabase } from "@/lib/supabase/client";
import type { TaskCategory } from "@/lib/types";

const DEFAULT_COLORS = ["#2f6f5e", "#c2553f", "#c98a1b", "#3f72b8", "#8456b3", "#6b6b66"];

/** タスクのカテゴリの追加・名前変更・色設定・削除 */
export function CategoryManager({
  categories,
  onChange,
  onDeleted,
  onClose,
}: {
  categories: TaskCategory[];
  onChange: (categories: TaskCategory[]) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const sb = getSupabase();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[categories.length % DEFAULT_COLORS.length]);
  const [error, setError] = useState<string | null>(null);

  const fail = (message: string) => setError(message);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data, error } = await sb
      .from("task_categories")
      .insert({ name: trimmed, color, sort_order: categories.length })
      .select("*")
      .single();
    if (error) return fail(error.message);
    setError(null);
    const next = [...categories, data as TaskCategory];
    onChange(next);
    setName("");
    setColor(DEFAULT_COLORS[next.length % DEFAULT_COLORS.length]);
  };

  const update = async (id: string, patch: Partial<Pick<TaskCategory, "name" | "color">>) => {
    const { error } = await sb.from("task_categories").update(patch).eq("id", id);
    if (error) return fail(error.message);
    setError(null);
    onChange(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const remove = async (category: TaskCategory) => {
    if (
      !window.confirm(
        `カテゴリ「${category.name}」を削除しますか？\nこのカテゴリのタスクは「カテゴリなし」になります。`,
      )
    ) {
      return;
    }
    const { error } = await sb.from("task_categories").delete().eq("id", category.id);
    if (error) return fail(error.message);
    setError(null);
    onChange(categories.filter((c) => c.id !== category.id));
    onDeleted(category.id);
  };

  return (
    <Modal title="カテゴリの管理" onClose={onClose}>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`「${c.name}」の色`}
              defaultValue={c.color}
              onBlur={(e) => e.target.value !== c.color && update(c.id, { color: e.target.value })}
              className="size-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
            />
            <input
              aria-label="カテゴリ名"
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) update(c.id, { name: v });
                else e.target.value = c.name;
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={inputClass}
            />
            <button type="button" aria-label={`「${c.name}」を削除`} className={iconButton} onClick={() => remove(c)}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {categories.length === 0 && <li className="text-sm text-muted">カテゴリはまだありません</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-4 flex items-center gap-2 border-t border-border pt-4"
      >
        <input
          type="color"
          aria-label="新しいカテゴリの色"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
        />
        <input
          aria-label="新しいカテゴリ名"
          placeholder="新しいカテゴリ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <button type="submit" disabled={!name.trim()} className={`${primaryButton} inline-flex shrink-0 items-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          追加
        </button>
      </form>
    </Modal>
  );
}
