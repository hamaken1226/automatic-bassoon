"use client";

import { Archive, Pencil, StickyNote, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NOTE_TAGS_CHANGED } from "@/lib/notes";
import { getSupabase } from "@/lib/supabase/client";
import type { NoteTag } from "@/lib/types";

/** メモのタグでの絞り込み・アーカイブ・ゴミ箱へのリンク（サイドメニューとスマホのメニュー内に出す） */
export function NoteTagNav({ onNavigate }: { onNavigate?: () => void }) {
  const params = useSearchParams();
  const tagId = params.get("tag");
  const view = params.get("view");
  const [tags, setTags] = useState<NoteTag[]>([]);

  useEffect(() => {
    const load = () =>
      getSupabase()
        .from("note_tags")
        .select("*")
        .order("name")
        .then(({ data }) => data && setTags(data as NoteTag[]));
    load();
    window.addEventListener(NOTE_TAGS_CHANGED, load);
    return () => window.removeEventListener(NOTE_TAGS_CHANGED, load);
  }, []);

  const item = (href: string, label: string, Icon: typeof Tag, active: boolean) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        active ? "font-semibold text-accent" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <nav aria-label="メモの絞り込み" className="flex flex-col gap-0.5">
      {item("/notes", "すべてのメモ", StickyNote, !tagId && !view)}
      {tags.map((t) => item(`/notes?tag=${t.id}`, t.name, Tag, tagId === t.id))}
      {item("/notes?view=tags", "タグを編集", Pencil, view === "tags")}
      {item("/notes?view=archive", "アーカイブ", Archive, view === "archive")}
      {item("/notes?view=trash", "ゴミ箱", Trash2, view === "trash")}
    </nav>
  );
}
