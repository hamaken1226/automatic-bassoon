"use client";

import { Archive, ArchiveRestore, Palette, Pin, Plus, Tag, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { iconButton, primaryButton } from "@/components/ui/styles";
import { isEmptyNote, NOTE_COLORS, TRASH_DAYS } from "@/lib/notes";
import { getSupabase } from "@/lib/supabase/client";
import type { Note, NoteItem, NoteTag, NoteWithDetails } from "@/lib/types";

const bySort = (a: NoteItem, b: NoteItem) =>
  a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/** メモの編集。変更はその場で保存する（タイトルと本文は入力欄を離れたとき・閉じたとき） */
export function NoteEditor({
  note,
  tags,
  onTagsChange,
  onChange,
  onPatch,
  onClose,
}: {
  note: NoteWithDetails;
  tags: NoteTag[];
  onTagsChange: (tags: NoteTag[]) => void;
  onChange: (note: NoteWithDetails) => void;
  onPatch: (patch: Partial<Note>) => Promise<void>;
  /** discard = true のときは、何も書かれていないので残さない */
  onClose: (discard: boolean) => void;
}) {
  const sb = getSupabase();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [newItem, setNewItem] = useState("");
  const [newTag, setNewTag] = useState("");
  const [panel, setPanel] = useState<"color" | "tags" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = [...note.note_items].sort(bySort);
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const tagIds = new Set(note.note_tag_links.map((l) => l.tag_id));

  /** タイトル・本文に変更があれば保存する */
  const flush = () => {
    if (title !== note.title || body !== note.body) return onPatch({ title, body });
  };

  const close = () => {
    const discard = isEmptyNote({ ...note, title, body });
    if (!discard) flush();
    onClose(discard);
  };

  // ---- チェックリスト ----
  const setItems = (next: NoteItem[]) => onChange({ ...note, note_items: next });

  const addItem = async () => {
    const text = newItem.trim();
    if (!text) return;
    setNewItem("");
    const sortOrder = items.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1;
    const { data, error } = await sb
      .from("note_items")
      .insert({ note_id: note.id, text, sort_order: sortOrder })
      .select("*")
      .single();
    if (error) return setError(error.message);
    setItems([...note.note_items, data as NoteItem]);
  };

  const updateItem = async (id: string, patch: Partial<Pick<NoteItem, "text" | "checked">>) => {
    const before = note.note_items;
    setItems(before.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const { error } = await sb.from("note_items").update(patch).eq("id", id);
    if (error) {
      setItems(before);
      setError(error.message);
    }
  };

  const removeItem = async (id: string) => {
    const before = note.note_items;
    setItems(before.filter((i) => i.id !== id));
    const { error } = await sb.from("note_items").delete().eq("id", id);
    if (error) {
      setItems(before);
      setError(error.message);
    }
  };

  // ---- タグ ----
  const toggleTag = async (tagId: string) => {
    const before = note.note_tag_links;
    const has = tagIds.has(tagId);
    onChange({
      ...note,
      note_tag_links: has ? before.filter((l) => l.tag_id !== tagId) : [...before, { tag_id: tagId }],
    });
    const { error } = has
      ? await sb.from("note_tag_links").delete().eq("note_id", note.id).eq("tag_id", tagId)
      : await sb.from("note_tag_links").insert({ note_id: note.id, tag_id: tagId });
    if (error) {
      onChange({ ...note, note_tag_links: before });
      setError(error.message);
    }
  };

  const createTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name === name);
    if (existing) {
      setNewTag("");
      if (!tagIds.has(existing.id)) await toggleTag(existing.id);
      return;
    }
    const { data, error } = await sb.from("note_tags").insert({ name }).select("*").single();
    if (error) return setError(error.message);
    const tag = data as NoteTag;
    setNewTag("");
    onTagsChange([...tags, tag]);
    await toggleTag(tag.id);
  };

  const toTrash = async () => {
    if (!window.confirm(`このメモをゴミ箱に移動しますか？\n${TRASH_DAYS}日後に完全に削除されます（それまではゴミ箱から戻せます）。`)) {
      return;
    }
    await onPatch({ title, body, deleted_at: new Date().toISOString(), pinned: false });
    onClose(false);
  };

  const toggleArchive = async () => {
    await onPatch({ title, body, archived: !note.archived, pinned: false });
    onClose(false);
  };

  const itemRow = (item: NoteItem) => (
    <li key={item.id} className="flex items-center gap-2">
      <input
        type="checkbox"
        aria-label={`「${item.text}」をチェック`}
        checked={item.checked}
        onChange={(e) => updateItem(item.id, { checked: e.target.checked })}
        className="size-5 shrink-0 accent-accent"
      />
      <input
        aria-label="項目"
        defaultValue={item.text}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (!v) removeItem(item.id);
          else if (v !== item.text) updateItem(item.id, { text: v });
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`min-w-0 flex-1 bg-transparent py-1.5 outline-none ${item.checked ? "text-muted line-through" : ""}`}
      />
      <button type="button" aria-label={`「${item.text}」を削除`} className={`${iconButton} size-8`} onClick={() => removeItem(item.id)}>
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );

  const toolButton = (label: string, Icon: typeof Pin, onClick: () => void, active = false) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`${iconButton} ${active ? "text-accent" : ""}`}
    >
      <Icon className="size-5" fill={active && Icon === Pin ? "currentColor" : "none"} aria-hidden />
    </button>
  );

  return (
    <Modal
      title={note.archived ? "メモ（アーカイブ）" : "メモ"}
      onClose={close}
      className="note-surface"
      noteColor={note.color}
      footer={
        <>
          {!note.archived && toolButton(note.pinned ? "ピン留めを外す" : "ピン留めする", Pin, () => onPatch({ pinned: !note.pinned }), note.pinned)}
          {toolButton("背景色", Palette, () => setPanel(panel === "color" ? null : "color"), panel === "color")}
          {toolButton("タグ", Tag, () => setPanel(panel === "tags" ? null : "tags"), panel === "tags")}
          {toolButton(note.archived ? "アーカイブから戻す" : "アーカイブ", note.archived ? ArchiveRestore : Archive, toggleArchive)}
          {toolButton("ゴミ箱に移動", Trash2, toTrash)}
          <span className="flex-1" />
          <button type="button" onClick={close} className={primaryButton}>
            閉じる
          </button>
        </>
      }
    >
      <div>
        {error && (
          <p role="alert" className="mb-3 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <input
          aria-label="タイトル"
          placeholder="タイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flush}
          className="mb-2 w-full bg-transparent text-lg font-semibold outline-none"
        />

        {note.kind === "text" ? (
          <textarea
            aria-label="メモの本文"
            placeholder="メモ"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={flush}
            className="[field-sizing:content] min-h-40 w-full resize-none bg-transparent outline-none"
          />
        ) : (
          <>
            <ul>{unchecked.map(itemRow)}</ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addItem();
              }}
              className="flex items-center gap-2"
            >
              <Plus className="size-5 shrink-0 text-muted" aria-hidden />
              <input
                aria-label="項目を追加"
                placeholder="項目を追加"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onBlur={addItem}
                className="min-w-0 flex-1 bg-transparent py-1.5 outline-none"
              />
            </form>
            {checked.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-2">
                <p className="mb-1 text-xs text-muted">チェック済み {checked.length}件</p>
                <ul>{checked.map(itemRow)}</ul>
              </div>
            )}
          </>
        )}

        {/* 付いているタグ */}
        {tagIds.size > 0 && panel !== "tags" && (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags
              .filter((t) => tagIds.has(t.id))
              .map((t) => (
                <span key={t.id} className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/15">
                  {t.name}
                </span>
              ))}
          </div>
        )}

        {panel === "color" && (
          <div role="group" aria-label="背景色" className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
            {NOTE_COLORS.map((c) => (
              <button
                key={c.key ?? "none"}
                type="button"
                aria-label={`背景色: ${c.label}`}
                aria-pressed={note.color === c.key}
                data-note-color={c.key ?? undefined}
                onClick={() => onPatch({ color: c.key })}
                className={`size-8 rounded-full border-2 ${note.color === c.key ? "border-accent" : "border-border"}`}
                style={{ background: c.key ? "var(--note-bg)" : "var(--card)" }}
              />
            ))}
          </div>
        )}

        {panel === "tags" && (
          <div role="group" aria-label="タグ" className="mt-4 border-t border-border/60 pt-3">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tagIds.has(t.id)}
                  onClick={() => toggleTag(t.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    tagIds.has(t.id) ? "border-accent bg-accent text-accent-foreground" : "border-border"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTag();
              }}
              className="mt-2 flex items-center gap-2"
            >
              <input
                aria-label="新しいタグ"
                placeholder="新しいタグを作って付ける"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
              <button type="submit" disabled={!newTag.trim()} className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50">
                追加
              </button>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}
