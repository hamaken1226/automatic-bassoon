"use client";

import { ExternalLink, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, iconButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort, todayJst } from "@/lib/date";
import { getSupabase } from "@/lib/supabase/client";
import type { NazoFormat, NazoPerformance, NazoResult } from "@/lib/types";
import { ErrorNote, matches, SearchBox } from "./shared";

export const FORMAT_LABEL: Record<NazoFormat, string> = {
  room: "ルーム型",
  hall: "ホール型",
  walk: "周遊型",
  online: "オンライン",
  other: "その他",
};
const RESULT_LABEL: Record<NazoResult, string> = { success: "成功", failure: "失敗" };

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center" aria-label={`評価 ${rating}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-3.5 ${n <= rating ? "text-accent" : "text-border"}`} fill="currentColor" aria-hidden />
      ))}
    </span>
  );
}

/** 公演の経験履歴（参加日順） */
export function PerformancesTab() {
  const sb = getSupabase();
  const [items, setItems] = useState<NazoPerformance[] | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<NazoPerformance | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await sb
      .from("nazo_performances")
      .select("*")
      .order("attended_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems(data as NazoPerformance[]);
  };
  useEffect(() => {
    Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = (items ?? []).filter((p) => matches(search, p.title, p.organizer, p.review, p.companions));
  const today = todayJst();

  return (
    <>
      <ErrorNote error={error} />
      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <SearchBox value={search} onChange={setSearch} placeholder="公演名・団体・感想・一緒に行った人で検索" />
        </div>
        <button type="button" onClick={() => setEditing("new")} className={`${primaryButton} inline-flex shrink-0 items-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          追加
        </button>
      </div>
      {items === null ? (
        <p className="text-sm text-muted">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          {items.length === 0 ? "公演の記録はまだありません" : "一致する公演はありません"}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card">
              <button type="button" onClick={() => setEditing(p)} className="block w-full p-3 text-left">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-sm text-muted">{p.attended_on ? formatDateShort(p.attended_on, today) : "参加日未設定"}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {p.organizer && <span>{p.organizer}</span>}
                  {p.format && <span>{FORMAT_LABEL[p.format]}</span>}
                  {p.result && <span className={p.result === "success" ? "font-semibold text-accent" : ""}>{RESULT_LABEL[p.result]}</span>}
                  {p.rating && <Stars rating={p.rating} />}
                  {p.companions && <span>with {p.companions}</span>}
                </span>
                {p.review && <span className="mt-2 line-clamp-4 block whitespace-pre-wrap break-words text-sm">{p.review}</span>}
              </button>
              {p.links.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-sm">
                  {p.links.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-accent underline">
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <PerformanceEditor
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function PerformanceEditor({ item, onClose, onSaved }: { item: NazoPerformance | null; onClose: () => void; onSaved: () => void }) {
  const sb = getSupabase();
  const [title, setTitle] = useState(item?.title ?? "");
  const [organizer, setOrganizer] = useState(item?.organizer ?? "");
  const [attendedOn, setAttendedOn] = useState(item?.attended_on ?? todayJst());
  const [links, setLinks] = useState<string[]>(item?.links.length ? item.links : [""]);
  const [review, setReview] = useState(item?.review ?? "");
  const [result, setResult] = useState<NazoResult | "">(item?.result ?? "");
  const [rating, setRating] = useState<number | null>(item?.rating ?? null);
  const [format, setFormat] = useState<NazoFormat | "">(item?.format ?? "");
  const [companions, setCompanions] = useState(item?.companions ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return setError("公演名を入力してください");
    const cleanLinks = links.map((l) => l.trim()).filter(Boolean);
    if (cleanLinks.some((l) => !/^https?:\/\//.test(l))) return setError("リンクは http:// か https:// で始まるURLを入力してください");
    const values = {
      title: title.trim(),
      organizer: organizer.trim(),
      attended_on: attendedOn || null,
      links: cleanLinks,
      review,
      result: result || null,
      rating,
      format: format || null,
      companions: companions.trim() || null,
    };
    const { error } = item ? await sb.from("nazo_performances").update(values).eq("id", item.id) : await sb.from("nazo_performances").insert(values);
    if (error) return setError(error.message);
    onSaved();
  };
  const remove = async () => {
    if (!item || !window.confirm(`「${item.title}」の記録を削除しますか？`)) return;
    const { error } = await sb.from("nazo_performances").delete().eq("id", item.id);
    if (error) return setError(error.message);
    onSaved();
  };

  const choice = <T extends string>(value: T | "", set: (v: T | "") => void, options: Record<T, string>, label: string) => (
    <fieldset>
      <legend className={labelClass}>{label}（任意）</legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(options) as T[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => set(value === k ? "" : k)}
            className={`rounded-full border px-3 py-1 text-sm ${value === k ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
          >
            {options[k]}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <Modal
      title={item ? "公演の記録" : "公演を追加"}
      onClose={onClose}
      footer={
        <>
          {item && (
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
          <span className={labelClass}>公演名</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>主催・団体名</span>
            <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>参加日</span>
            <input type="date" value={attendedOn} onChange={(e) => setAttendedOn(e.target.value)} className={inputClass} />
          </label>
        </div>
        <fieldset>
          <legend className={labelClass}>公演ページのリンク</legend>
          <ul className="space-y-2">
            {links.map((l, i) => (
              <li key={i} className="flex gap-2">
                <input
                  type="url"
                  inputMode="url"
                  aria-label="リンク"
                  placeholder="https://"
                  value={l}
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
                  className={inputClass}
                />
                <button type="button" aria-label="このリンクを外す" className={iconButton} onClick={() => setLinks(links.length > 1 ? links.filter((_, j) => j !== i) : [""])}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setLinks([...links, ""])} className={`${secondaryButton} mt-2 inline-flex items-center gap-1 px-2 py-1`}>
            <Plus className="size-4" aria-hidden />
            リンクを追加
          </button>
        </fieldset>
        <label className="block">
          <span className={labelClass}>感想</span>
          <textarea value={review} onChange={(e) => setReview(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-24`} />
        </label>
        {choice(result, setResult, RESULT_LABEL, "結果")}
        <fieldset>
          <legend className={labelClass}>評価（任意）</legend>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`★${n}`}
                aria-pressed={rating === n}
                onClick={() => setRating(rating === n ? null : n)}
                className="p-1"
              >
                <Star className={`size-6 ${rating !== null && n <= rating ? "text-accent" : "text-border"}`} fill="currentColor" aria-hidden />
              </button>
            ))}
            {rating !== null && <span className="ml-1 text-sm text-muted">{rating}</span>}
          </div>
        </fieldset>
        {choice(format, setFormat, FORMAT_LABEL, "形式")}
        <label className="block">
          <span className={labelClass}>一緒に行った人（任意）</span>
          <input value={companions} onChange={(e) => setCompanions(e.target.value)} className={inputClass} />
        </label>
      </div>
    </Modal>
  );
}
