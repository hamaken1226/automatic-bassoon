"use client";

import { Eye, EyeOff, Plus, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, iconButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { getSupabase } from "@/lib/supabase/client";
import type { NazoIdea, NazoTag } from "@/lib/types";
import { ErrorNote, matches, SearchBox } from "./shared";

const SELECT = "*, nazo_idea_tags(tag_id)";

/** 小謎アイデア: 答えは普段隠し、タップで表示。タグ（謎解きメモ専用）で絞り込み */
export function IdeasTab() {
  const sb = getSupabase();
  const [ideas, setIdeas] = useState<NazoIdea[] | null>(null);
  const [tags, setTags] = useState<NazoTag[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<NazoIdea | "new" | null>(null);
  const [managingTags, setManagingTags] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [i, t] = await Promise.all([
      sb.from("nazo_ideas").select(SELECT).order("created_at", { ascending: false }),
      sb.from("nazo_tags").select("*").order("name"),
    ]);
    const failed = i.error ?? t.error;
    if (failed) return setError(failed.message);
    setIdeas(i.data as NazoIdea[]);
    setTags(t.data as NazoTag[]);
  };

  useEffect(() => {
    Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const visible = (ideas ?? []).filter(
    (i) =>
      (!tagFilter || i.nazo_idea_tags.some((l) => l.tag_id === tagFilter)) &&
      matches(search, i.title, i.body, i.answer, i.explanation, ...i.nazo_idea_tags.map((l) => tagName.get(l.tag_id))),
  );

  const toggle = (id: string) => {
    const next = new Set(revealed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRevealed(next);
  };

  return (
    <>
      <ErrorNote error={error} />
      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <SearchBox value={search} onChange={setSearch} placeholder="タイトル・本文・答え・タグで検索" />
        </div>
        <button type="button" onClick={() => setEditing("new")} className={`${primaryButton} inline-flex shrink-0 items-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          追加
        </button>
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {[{ id: null, name: "すべて" }, ...tags].map((t) => (
          <button
            key={t.id ?? "all"}
            type="button"
            aria-pressed={tagFilter === t.id}
            onClick={() => setTagFilter(t.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${tagFilter === t.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border bg-card"}`}
          >
            {t.name}
          </button>
        ))}
        <button type="button" onClick={() => setManagingTags(true)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted">
          <Tag className="size-3.5" aria-hidden />
          タグを編集
        </button>
      </div>

      {ideas === null ? (
        <p className="text-sm text-muted">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          {ideas.length === 0 ? "アイデアはまだありません" : "一致するアイデアはありません"}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((idea) => {
            const shown = revealed.has(idea.id);
            const hasAnswer = !!(idea.answer || idea.explanation);
            return (
              <li key={idea.id} className="flex flex-col rounded-xl border border-border bg-card">
                <button type="button" onClick={() => setEditing(idea)} className="block p-3 text-left">
                  <h3 className="break-words font-semibold">{idea.title}</h3>
                  {idea.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{idea.body}</p>}
                  {idea.nazo_idea_tags.length > 0 && (
                    <span className="mt-2 flex flex-wrap gap-1">
                      {idea.nazo_idea_tags.map((l) => (
                        <span key={l.tag_id} className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                          {tagName.get(l.tag_id)}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                {hasAnswer && (
                  <div className="mt-auto border-t border-border px-3 py-2">
                    <button
                      type="button"
                      aria-expanded={shown}
                      onClick={() => toggle(idea.id)}
                      className="inline-flex items-center gap-1.5 text-sm text-accent"
                    >
                      {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      {shown ? "答えを隠す" : "答えを見る"}
                    </button>
                    {shown && (
                      <div className="mt-2 space-y-1 text-sm">
                        {idea.answer && (
                          <p className="whitespace-pre-wrap break-words">
                            <span className="mr-2 text-xs font-semibold text-muted">答え</span>
                            {idea.answer}
                          </p>
                        )}
                        {idea.explanation && (
                          <p className="whitespace-pre-wrap break-words">
                            <span className="mr-2 text-xs font-semibold text-muted">解説</span>
                            {idea.explanation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <IdeaEditor
          idea={editing === "new" ? null : editing}
          tags={tags}
          onTagsChange={setTags}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
      {managingTags && (
        <TagManager
          tags={tags}
          onClose={async () => {
            setManagingTags(false);
            await load();
          }}
        />
      )}
    </>
  );
}

function IdeaEditor({
  idea,
  tags,
  onTagsChange,
  onClose,
  onSaved,
}: {
  idea: NazoIdea | null;
  tags: NazoTag[];
  onTagsChange: (tags: NazoTag[]) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sb = getSupabase();
  const [title, setTitle] = useState(idea?.title ?? "");
  const [body, setBody] = useState(idea?.body ?? "");
  const [answer, setAnswer] = useState(idea?.answer ?? "");
  const [explanation, setExplanation] = useState(idea?.explanation ?? "");
  const [tagIds, setTagIds] = useState<string[]>(idea?.nazo_idea_tags.map((l) => l.tag_id) ?? []);
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name === name);
    if (existing) {
      if (!tagIds.includes(existing.id)) setTagIds([...tagIds, existing.id]);
    } else {
      const { data, error } = await sb.from("nazo_tags").insert({ name }).select("*").single();
      if (error) return setError(error.message);
      onTagsChange([...tags, data as NazoTag].sort((a, b) => a.name.localeCompare(b.name, "ja")));
      setTagIds([...tagIds, (data as NazoTag).id]);
    }
    setNewTag("");
  };

  const save = async () => {
    if (!title.trim()) return setError("タイトルを入力してください");
    const values = { title: title.trim(), body, answer: answer.trim() || null, explanation: explanation.trim() || null };
    let id = idea?.id;
    if (id) {
      const { error } = await sb.from("nazo_ideas").update(values).eq("id", id);
      if (error) return setError(error.message);
      const del = await sb.from("nazo_idea_tags").delete().eq("idea_id", id);
      if (del.error) return setError(del.error.message);
    } else {
      const { data, error } = await sb.from("nazo_ideas").insert(values).select("id").single();
      if (error) return setError(error.message);
      id = (data as { id: string }).id;
    }
    if (tagIds.length > 0) {
      const { error } = await sb.from("nazo_idea_tags").insert(tagIds.map((tag_id) => ({ idea_id: id, tag_id })));
      if (error) return setError(error.message);
    }
    onSaved();
  };

  const remove = async () => {
    if (!idea || !window.confirm(`「${idea.title}」を削除しますか？`)) return;
    const { error } = await sb.from("nazo_ideas").delete().eq("id", idea.id);
    if (error) return setError(error.message);
    onSaved();
  };

  return (
    <Modal
      title={idea ? "小謎アイデア" : "小謎アイデアを追加"}
      onClose={onClose}
      footer={
        <>
          {idea && (
            <button type="button" onClick={remove} className={dangerButton}>
              削除
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            キャンセル
          </button>
          <button type="button" onClick={save} className={primaryButton}>
            保存
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error} />
        <label className="block">
          <span className={labelClass}>タイトル</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>本文</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-24`} />
        </label>
        <label className="block">
          <span className={labelClass}>答え（任意）</span>
          <input value={answer} onChange={(e) => setAnswer(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>解説（任意）</span>
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-16`} />
        </label>
        <fieldset>
          <legend className={labelClass}>タグ</legend>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addTag();
            }}
            className="mt-2 flex gap-2"
          >
            <input aria-label="新しいタグ" placeholder="新しいタグを作って付ける" value={newTag} onChange={(e) => setNewTag(e.target.value)} className={`${inputClass} py-1.5`} />
            <button type="submit" disabled={!newTag.trim()} className={`${secondaryButton} shrink-0`}>
              追加
            </button>
          </form>
        </fieldset>
      </div>
    </Modal>
  );
}

function TagManager({ tags, onClose }: { tags: NazoTag[]; onClose: () => void }) {
  const sb = getSupabase();
  const [list, setList] = useState(tags);
  const [error, setError] = useState<string | null>(null);
  const message = (e: { message: string; code?: string }) => (e.code === "23505" ? "同じ名前のタグがすでにあります" : e.message);

  const rename = async (tag: NazoTag, name: string) => {
    const { error } = await sb.from("nazo_tags").update({ name }).eq("id", tag.id);
    if (error) return setError(message(error));
    setList(list.map((t) => (t.id === tag.id ? { ...t, name } : t)));
  };

  const remove = async (tag: NazoTag) => {
    if (!window.confirm(`タグ「${tag.name}」を削除しますか？\nアイデア自体は削除されません。`)) return;
    const { error } = await sb.from("nazo_tags").delete().eq("id", tag.id);
    if (error) return setError(message(error));
    setList(list.filter((t) => t.id !== tag.id));
  };

  return (
    <Modal title="謎解きメモのタグを編集" onClose={onClose}>
      <ErrorNote error={error} />
      <p className="mb-3 text-xs text-muted">メモのタグとは別に管理しています。新しいタグはアイデアの編集画面で作れます。</p>
      <ul className="space-y-2">
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <input
              aria-label="タグ名"
              defaultValue={t.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== t.name) rename(t, v);
                else e.target.value = t.name;
              }}
              className={inputClass}
            />
            <button type="button" aria-label={`タグ「${t.name}」を削除`} className={iconButton} onClick={() => remove(t)}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-muted">タグはまだありません</li>}
      </ul>
    </Modal>
  );
}
