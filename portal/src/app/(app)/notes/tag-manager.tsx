"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { iconButton, inputClass, primaryButton } from "@/components/ui/styles";
import { getSupabase } from "@/lib/supabase/client";
import type { NoteTag } from "@/lib/types";

/** メモのタグの追加・名前変更・削除 */
export function TagManager({
  tags,
  onChange,
  onDeleted,
  onClose,
}: {
  tags: NoteTag[];
  onChange: (tags: NoteTag[]) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const sb = getSupabase();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const message = (e: { message: string; code?: string }) =>
    e.code === "23505" ? "同じ名前のタグがすでにあります" : e.message;

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data, error } = await sb.from("note_tags").insert({ name: trimmed }).select("*").single();
    if (error) return setError(message(error));
    setError(null);
    onChange([...tags, data as NoteTag]);
    setName("");
  };

  const rename = async (tag: NoteTag, next: string) => {
    const { error } = await sb.from("note_tags").update({ name: next }).eq("id", tag.id);
    if (error) return setError(message(error));
    setError(null);
    onChange(tags.map((t) => (t.id === tag.id ? { ...t, name: next } : t)));
  };

  const remove = async (tag: NoteTag) => {
    if (!window.confirm(`タグ「${tag.name}」を削除しますか？\nメモ自体は削除されません。`)) return;
    const { error } = await sb.from("note_tags").delete().eq("id", tag.id);
    if (error) return setError(message(error));
    setError(null);
    onChange(tags.filter((t) => t.id !== tag.id));
    onDeleted(tag.id);
  };

  return (
    <Modal title="タグを編集" onClose={onClose}>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {tags.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <input
              aria-label="タグ名"
              defaultValue={t.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== t.name) rename(t, v);
                else e.target.value = t.name;
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={inputClass}
            />
            <button type="button" aria-label={`タグ「${t.name}」を削除`} className={iconButton} onClick={() => remove(t)}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {tags.length === 0 && <li className="text-sm text-muted">タグはまだありません</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-4 flex items-center gap-2 border-t border-border pt-4"
      >
        <input
          aria-label="新しいタグ名"
          placeholder="新しいタグ"
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
