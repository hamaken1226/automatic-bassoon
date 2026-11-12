"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { LogList } from "@/components/log-list";
import { Modal } from "@/components/ui/modal";
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatDateShort } from "@/lib/date";
import { nextBandPractice, type StudyData } from "@/lib/study";
import type { StudyStore } from "@/lib/use-study";
import type { BandPractice, Initiative, Song } from "@/lib/types";
import { daysLeftLabel, ErrorNote } from "../shared";

type Props = { initiative: Initiative; data: StudyData; store: StudyStore; today: string };

/** メモ中のURLをリンクにする（参考音源のリンクなど） */
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function PracticeView({ initiative, data, store, today }: Props) {
  const songs = data.songs.filter((s) => s.initiative_id === initiative.id);
  const practices = data.bandPractices.filter((b) => b.initiative_id === initiative.id);
  const next = nextBandPractice(practices, today);
  const upcoming = practices.filter((p) => p.date >= today);
  const past = practices.filter((p) => p.date < today).reverse();
  const songTitle = (id: string) => songs.find((s) => s.id === id)?.title ?? "（削除された曲）";

  const [songEditor, setSongEditor] = useState<Song | "new" | null>(null);
  const [practiceEditor, setPracticeEditor] = useState<BandPractice | "new" | null>(null);

  const practiceItem = (p: BandPractice) => (
    <li key={p.id} className="border-b border-border last:border-b-0">
      <button type="button" onClick={() => setPracticeEditor(p)} className="block w-full px-3 py-2.5 text-left">
        <span className="font-semibold">{formatDateShort(p.date, today)}</span>
        <span className="ml-2 text-sm text-muted">{daysLeftLabel(today, p.date)}</span>
        {p.place_memo && <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm">{p.place_memo}</span>}
        {p.band_practice_songs.length > 0 && (
          <span className="mt-0.5 block text-sm text-muted">
            曲: {p.band_practice_songs.map((s) => songTitle(s.song_id)).join("、")}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div className="space-y-6">
      <section aria-label="次のバンド練習" className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted">次のバンド練習</p>
        {next ? (
          <>
            <p className="text-2xl font-bold">{daysLeftLabel(today, next.date)}</p>
            <p className="text-sm text-muted">
              {formatDateShort(next.date, today)}
              {next.place_memo && ` ・ ${next.place_memo}`}
            </p>
            {next.band_practice_songs.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {next.band_practice_songs.map((s) => (
                  <li key={s.song_id} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm text-accent">
                    {songTitle(s.song_id)}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">予定はありません</p>
        )}
      </section>

      <section aria-label="曲目">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">
            曲目<span className="ml-2 font-normal">{songs.length}</span>
          </h2>
          <button type="button" onClick={() => setSongEditor("new")} className={`${secondaryButton} inline-flex items-center gap-1`}>
            <Plus className="size-4" aria-hidden />
            曲を追加
          </button>
        </div>
        {songs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted">曲はまだありません</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {songs.map((s) => (
              <li key={s.id} className="rounded-xl border border-border bg-card">
                <button type="button" onClick={() => setSongEditor(s)} className="block w-full p-3 text-left hover:text-accent">
                  <span className="block font-semibold">{s.title}</span>
                  {s.artist && <span className="block text-sm text-muted">{s.artist}</span>}
                </button>
                {s.memo && (
                  <p className="whitespace-pre-wrap break-words border-t border-border px-3 py-2 text-sm">
                    <Linkified text={s.memo} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="バンド練習日">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">バンド練習日</h2>
          <button type="button" onClick={() => setPracticeEditor("new")} className={`${secondaryButton} inline-flex items-center gap-1`}>
            <Plus className="size-4" aria-hidden />
            練習日を追加
          </button>
        </div>
        {practices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted">練習日はまだありません</p>
        ) : (
          <>
            {upcoming.length > 0 && <ul className="rounded-xl border border-border bg-card">{upcoming.map(practiceItem)}</ul>}
            {past.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-muted">過去の練習日（{past.length}件）</summary>
                <ul className="mt-2 rounded-xl border border-border bg-card">{past.map(practiceItem)}</ul>
              </details>
            )}
          </>
        )}
      </section>

      {songEditor && (
        <SongEditor song={songEditor === "new" ? null : songEditor} initiative={initiative} store={store} onClose={() => setSongEditor(null)} />
      )}
      {practiceEditor && (
        <PracticeEditor
          practice={practiceEditor === "new" ? null : practiceEditor}
          initiative={initiative}
          songs={songs}
          store={store}
          today={today}
          onClose={() => setPracticeEditor(null)}
        />
      )}
    </div>
  );
}

/** 曲の追加・編集と練習ログ */
function SongEditor({
  song,
  initiative,
  store,
  onClose,
}: {
  song: Song | null;
  initiative: Initiative;
  store: StudyStore;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [memo, setMemo] = useState(song?.memo ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return setError("曲名を入力してください");
    const values = { title: title.trim(), artist: artist.trim(), memo };
    const ok = await store.mutate(() =>
      song
        ? store.sb.from("songs").update(values).eq("id", song.id)
        : store.sb.from("songs").insert({ ...values, initiative_id: initiative.id }),
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!song || !window.confirm(`曲「${song.title}」を削除しますか？\n練習ログも削除されます。`)) return;
    const ok = await store.mutate(() => store.sb.from("songs").delete().eq("id", song.id));
    if (ok) onClose();
  };

  return (
    <Modal
      title={song ? "曲" : "曲を追加"}
      onClose={onClose}
      footer={
        <>
          {song && (
            <button type="button" onClick={remove} className={dangerButton}>
              削除
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            {song ? "閉じる" : "キャンセル"}
          </button>
          <button type="button" onClick={save} className={primaryButton}>
            保存
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error ?? store.error} />
        <label className="block">
          <span className={labelClass}>曲名</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>アーティスト</span>
          <input value={artist} onChange={(e) => setArtist(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>メモ（参考音源のリンクなど）</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-16`} />
        </label>
        {song && (
          <section aria-label="練習ログ" className="border-t border-border pt-4">
            <h3 className={labelClass}>練習ログ</h3>
            <LogList table="song_logs" parentColumn="song_id" parentId={song.id} label="練習ログ" placeholder="今日の練習内容・進み具合をメモ" />
          </section>
        )}
      </div>
    </Modal>
  );
}

/** バンド練習日の追加・編集 */
function PracticeEditor({
  practice,
  initiative,
  songs,
  store,
  today,
  onClose,
}: {
  practice: BandPractice | null;
  initiative: Initiative;
  songs: Song[];
  store: StudyStore;
  today: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(practice?.date ?? today);
  const [placeMemo, setPlaceMemo] = useState(practice?.place_memo ?? "");
  const [songIds, setSongIds] = useState<string[]>(practice?.band_practice_songs.map((s) => s.song_id) ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!date) return setError("日付を入力してください");
    const ok = await store.mutate(async () => {
      const { sb } = store;
      let id = practice?.id;
      if (id) {
        const res = await sb.from("band_practices").update({ date, place_memo: placeMemo }).eq("id", id);
        if (res.error) return res;
        const del = await sb.from("band_practice_songs").delete().eq("band_practice_id", id);
        if (del.error) return del;
      } else {
        const res = await sb.from("band_practices").insert({ initiative_id: initiative.id, date, place_memo: placeMemo }).select("id").single();
        if (res.error) return res;
        id = (res.data as { id: string }).id;
      }
      if (songIds.length === 0) return;
      return sb.from("band_practice_songs").insert(songIds.map((song_id) => ({ band_practice_id: id, song_id })));
    });
    if (ok) onClose();
  };

  const remove = async () => {
    if (!practice || !window.confirm("このバンド練習日を削除しますか？")) return;
    const ok = await store.mutate(() => store.sb.from("band_practices").delete().eq("id", practice.id));
    if (ok) onClose();
  };

  return (
    <Modal
      title={practice ? "バンド練習日を編集" : "バンド練習日を追加"}
      onClose={onClose}
      footer={
        <>
          {practice && (
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
        <ErrorNote error={error ?? store.error} />
        <label className="block">
          <span className={labelClass}>日付</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>場所・メモ</span>
          <textarea value={placeMemo} onChange={(e) => setPlaceMemo(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-16`} />
        </label>
        <fieldset>
          <legend className={labelClass}>その日にやる曲</legend>
          {songs.length === 0 ? (
            <p className="text-sm text-muted">先に曲目を追加してください</p>
          ) : (
            <div className="space-y-1">
              {songs.map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={songIds.includes(s.id)}
                    onChange={(e) => setSongIds(e.target.checked ? [...songIds, s.id] : songIds.filter((id) => id !== s.id))}
                    className="size-5 accent-accent"
                  />
                  {s.title}
                  {s.artist && <span className="text-sm text-muted">{s.artist}</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
