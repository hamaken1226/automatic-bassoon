"use client";

import { ListChecks, Pin, RotateCcw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { dangerButton, iconButton, inputClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { NOTE_SELECT, NOTE_TAGS_CHANGED, TRASH_DAYS, trashDaysLeft } from "@/lib/notes";
import { getSupabase } from "@/lib/supabase/client";
import type { Note, NoteTag, NoteWithDetails } from "@/lib/types";
import { NoteEditor } from "./note-editor";
import { TagManager } from "./tag-manager";

const CARD_ITEM_LIMIT = 8;

export function NotesApp() {
  const sb = getSupabase();
  const router = useRouter();
  const params = useSearchParams();
  const tagId = params.get("tag");
  const view = params.get("view"); // null | "archive" | "trash" | "tags"

  const [notes, setNotes] = useState<NoteWithDetails[] | null>(null);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 上部の入力欄（テキストメモ）
  const [composing, setComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const composerRef = useRef<HTMLDivElement>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => {
    (async () => {
      // ゴミ箱に入れて7日過ぎたメモを完全に削除する
      const limit = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
      await sb.from("notes").delete().lt("deleted_at", limit);
      const [n, t] = await Promise.all([
        sb.from("notes").select(NOTE_SELECT).order("created_at", { ascending: false }),
        sb.from("note_tags").select("*").order("name"),
      ]);
      const failed = n.error ?? t.error;
      if (failed) return setError(failed.message);
      setNotes(n.data as NoteWithDetails[]);
      setTags(t.data as NoteTag[]);
    })();
  }, [sb]);

  const updateTags = useCallback((next: NoteTag[]) => {
    setTags([...next].sort((a, b) => a.name.localeCompare(b.name, "ja")));
    window.dispatchEvent(new Event(NOTE_TAGS_CHANGED));
  }, []);

  const replaceNote = useCallback((note: NoteWithDetails) => {
    setNotes((prev) => (prev ?? []).map((n) => (n.id === note.id ? note : n)));
  }, []);

  /** メモ本体の項目を変更する（先に画面へ反映し、失敗したら元に戻す） */
  const patchNote = useCallback(
    async (id: string, patch: Partial<Note>) => {
      let before: NoteWithDetails | undefined;
      setNotes((prev) =>
        (prev ?? []).map((n) => {
          if (n.id !== id) return n;
          before = n;
          return { ...n, ...patch };
        }),
      );
      const { error } = await sb.from("notes").update(patch).eq("id", id);
      if (error) {
        if (before) replaceNote(before);
        fail(error.message);
      }
    },
    [sb, replaceNote, fail],
  );

  const removeForever = useCallback(
    async (ids: string[]) => {
      const { error } = await sb.from("notes").delete().in("id", ids);
      if (error) return fail(error.message);
      setNotes((prev) => (prev ?? []).filter((n) => !ids.includes(n.id)));
    },
    [sb, fail],
  );

  const createNote = async (values: Partial<Note>) => {
    const { data, error } = await sb.from("notes").insert(values).select(NOTE_SELECT).single();
    if (error) {
      fail(error.message);
      return null;
    }
    let note = data as NoteWithDetails;
    // タグで絞り込み中に作ったメモには、そのタグを付ける
    if (tagId && tags.some((t) => t.id === tagId)) {
      const link = await sb.from("note_tag_links").insert({ note_id: note.id, tag_id: tagId });
      if (!link.error) note = { ...note, note_tag_links: [{ tag_id: tagId }] };
    }
    setNotes((prev) => [note, ...(prev ?? [])]);
    return note;
  };

  const saveDraft = useCallback(async () => {
    setComposing(false);
    const title = draftTitle.trim();
    const body = draftBody.trim();
    setDraftTitle("");
    setDraftBody("");
    if (title || body) await createNote({ title, body, kind: "text" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTitle, draftBody, tagId, tags]);

  // 入力欄の外をクリックしたら保存して閉じる
  useEffect(() => {
    if (!composing) return;
    const onDown = (e: PointerEvent) => {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) saveDraft();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [composing, saveDraft]);

  const newChecklist = async () => {
    const note = await createNote({ kind: "checklist" });
    if (note) setEditingId(note.id);
  };

  const closeEditor = (discard: boolean) => {
    const id = editingId;
    setEditingId(null);
    // 何も書かずに閉じたメモは残さない
    if (discard && id) removeForever([id]);
  };

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const currentTag = tagId ? tagById.get(tagId) : undefined;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (view === "trash") {
        if (!n.deleted_at) return false;
      } else {
        if (n.deleted_at) return false;
        if (view === "archive" ? !n.archived : n.archived) return false;
        if (view !== "archive" && tagId && !n.note_tag_links.some((l) => l.tag_id === tagId)) return false;
      }
      if (!q) return true;
      // タイトル・本文・チェックリスト・タグを横断して検索
      const text = [
        n.title,
        n.body,
        ...n.note_items.map((i) => i.text),
        ...n.note_tag_links.map((l) => tagById.get(l.tag_id)?.name ?? ""),
      ]
        .join("\n")
        .toLowerCase();
      return text.includes(q);
    });
  }, [notes, view, tagId, search, tagById]);

  const pinned = view ? [] : visible.filter((n) => n.pinned);
  const others = view ? visible : visible.filter((n) => !n.pinned);
  const editing = notes?.find((n) => n.id === editingId) ?? null;
  const isTrash = view === "trash";

  const renderCard = (note: NoteWithDetails) => {
    const items = [...note.note_items].sort(
      (a, b) => Number(a.checked) - Number(b.checked) || a.sort_order - b.sort_order,
    );
    const noteTags = note.note_tag_links
      .map((l) => tagById.get(l.tag_id))
      .filter((t): t is NoteTag => !!t);
    return (
      <article
        key={note.id}
        data-note-color={note.color ?? undefined}
        className="note-surface group relative mb-3 break-inside-avoid rounded-xl border border-border"
      >
        {!isTrash && (
          <button
            type="button"
            aria-label={note.pinned ? "ピン留めを外す" : "ピン留めする"}
            aria-pressed={note.pinned}
            onClick={() => patchNote(note.id, { pinned: !note.pinned })}
            className={`absolute right-1 top-1 flex size-8 items-center justify-center rounded-full hover:bg-black/10 ${
              note.pinned ? "text-accent" : "text-muted md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
            }`}
          >
            <Pin className="size-4" fill={note.pinned ? "currentColor" : "none"} aria-hidden />
          </button>
        )}
        <button
          type="button"
          disabled={isTrash}
          onClick={() => setEditingId(note.id)}
          aria-label={`メモ「${note.title || note.body.slice(0, 20) || "無題"}」を開く`}
          className="block w-full p-3 text-left"
        >
          {note.title && <h3 className="mb-1 break-words pr-7 font-semibold">{note.title}</h3>}
          {note.kind === "text" ? (
            note.body && <p className="line-clamp-[12] whitespace-pre-wrap break-words text-sm">{note.body}</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {items.slice(0, CARD_ITEM_LIMIT).map((i) => (
                <li key={i.id} className={`flex items-start gap-1.5 ${i.checked ? "text-muted line-through" : ""}`}>
                  <span
                    className={`mt-1 size-3 shrink-0 rounded-sm border ${i.checked ? "border-muted bg-muted" : "border-foreground/50"}`}
                  />
                  <span className="break-words">{i.text}</span>
                </li>
              ))}
              {items.length > CARD_ITEM_LIMIT && (
                <li className="text-xs text-muted">ほか {items.length - CARD_ITEM_LIMIT} 件</li>
              )}
            </ul>
          )}
          {!note.title && !note.body && items.length === 0 && <p className="text-sm text-muted">（空のメモ）</p>}
          {noteTags.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {noteTags.map((t) => (
                <span key={t.id} className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/15">
                  {t.name}
                </span>
              ))}
            </span>
          )}
        </button>
        {isTrash && note.deleted_at && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2">
            <span className="mr-auto text-xs text-muted">あと{trashDaysLeft(note.deleted_at)}日で削除</span>
            <button
              type="button"
              className={`${secondaryButton} inline-flex items-center gap-1 px-2 py-1 text-xs`}
              onClick={() => patchNote(note.id, { deleted_at: null })}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              元に戻す
            </button>
            <button
              type="button"
              className={`${dangerButton} inline-flex items-center gap-1 px-2 py-1 text-xs`}
              onClick={() => window.confirm("このメモを完全に削除しますか？\n元に戻せません。") && removeForever([note.id])}
            >
              <Trash2 className="size-3.5" aria-hidden />
              完全に削除
            </button>
          </div>
        )}
      </article>
    );
  };

  const grid = (list: NoteWithDetails[]) => (
    <div className="columns-2 gap-3 md:columns-3 xl:columns-4">{list.map(renderCard)}</div>
  );

  const title = view === "archive" ? "アーカイブ" : isTrash ? "ゴミ箱" : currentTag ? `タグ: ${currentTag.name}` : "メモ";

  return (
    <>
      <PageHeader title={title} />

      {(view === "archive" || isTrash || currentTag) && (
        <Link href="/notes" className="-mt-3 mb-4 inline-flex items-center gap-1 text-sm text-accent underline">
          <X className="size-4" aria-hidden />
          すべてのメモに戻る
        </Link>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* すぐ書ける入力欄 */}
      {!view && (
        <div ref={composerRef} className="mx-auto mb-4 max-w-xl rounded-xl border border-border bg-card shadow-sm">
          {composing ? (
            <div className="p-3">
              <input
                aria-label="タイトル"
                placeholder="タイトル"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="mb-1 w-full bg-transparent font-semibold outline-none"
              />
              <textarea
                autoFocus
                aria-label="メモの本文"
                placeholder="メモを入力…"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && saveDraft()}
                className="[field-sizing:content] min-h-16 w-full resize-none bg-transparent outline-none"
              />
              <div className="flex justify-end">
                <button type="button" onClick={saveDraft} className={primaryButton}>
                  完了
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center">
              <button type="button" onClick={() => setComposing(true)} className="flex-1 px-4 py-3 text-left text-muted">
                メモを入力…
              </button>
              <button type="button" aria-label="チェックリストを作成" title="チェックリストを作成" onClick={newChecklist} className={`${iconButton} mr-2`}>
                <ListChecks className="size-5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          aria-label="メモを検索"
          placeholder="タイトル・本文・タグで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-9`}
        />
      </div>

      {isTrash && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <p>ゴミ箱のメモは{TRASH_DAYS}日後に自動で完全に削除されます</p>
          {visible.length > 0 && (
            <button
              type="button"
              className={dangerButton}
              onClick={() =>
                window.confirm(`ゴミ箱の${visible.length}件を完全に削除しますか？\n元に戻せません。`) &&
                removeForever(visible.map((n) => n.id))
              }
            >
              ゴミ箱を空にする
            </button>
          )}
        </div>
      )}

      {notes === null ? (
        <p className="text-sm text-muted">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          {search.trim()
            ? "一致するメモはありません"
            : isTrash
              ? "ゴミ箱は空です"
              : view === "archive"
                ? "アーカイブしたメモはありません"
                : "メモはまだありません"}
        </p>
      ) : (
        <>
          {pinned.length > 0 && (
            <section aria-label="ピン留め" className="mb-4">
              <h2 className="mb-2 text-xs font-semibold text-muted">ピン留め</h2>
              {grid(pinned)}
            </section>
          )}
          {others.length > 0 && (
            <section aria-label="メモ一覧">
              {pinned.length > 0 && <h2 className="mb-2 text-xs font-semibold text-muted">その他</h2>}
              {grid(others)}
            </section>
          )}
        </>
      )}

      {editing && (
        <NoteEditor
          key={editing.id}
          note={editing}
          tags={tags}
          onTagsChange={updateTags}
          onChange={replaceNote}
          onPatch={(patch) => patchNote(editing.id, patch)}
          onClose={closeEditor}
        />
      )}

      {view === "tags" && (
        <TagManager
          tags={tags}
          onChange={updateTags}
          onDeleted={(id) =>
            setNotes((prev) =>
              (prev ?? []).map((n) => ({
                ...n,
                note_tag_links: n.note_tag_links.filter((l) => l.tag_id !== id),
              })),
            )
          }
          onClose={() => router.push("/notes")}
        />
      )}
    </>
  );
}
