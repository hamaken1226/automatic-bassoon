import type { NoteWithDetails } from "./types";

export const NOTE_SELECT = "*, note_items(*), note_tag_links(tag_id)";

/** メモの背景色の選択肢（色そのものは globals.css の data-note-color で定義） */
export const NOTE_COLORS: { key: string | null; label: string }[] = [
  { key: null, label: "なし" },
  { key: "red", label: "赤" },
  { key: "orange", label: "オレンジ" },
  { key: "yellow", label: "黄" },
  { key: "green", label: "緑" },
  { key: "teal", label: "青緑" },
  { key: "blue", label: "青" },
  { key: "purple", label: "紫" },
  { key: "pink", label: "ピンク" },
  { key: "gray", label: "グレー" },
];

/** ゴミ箱に入れてから完全に削除するまでの日数 */
export const TRASH_DAYS = 7;

/** タグの追加・変更をサイドメニュー側に知らせるイベント名 */
export const NOTE_TAGS_CHANGED = "note-tags-changed";

export function isEmptyNote(note: NoteWithDetails): boolean {
  return !note.title.trim() && !note.body.trim() && note.note_items.every((i) => !i.text.trim());
}

/** ゴミ箱のメモが完全に削除されるまでの残り日数 */
export function trashDaysLeft(deletedAt: string, now: number = Date.now()): number {
  const left = TRASH_DAYS - (now - new Date(deletedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(left));
}
