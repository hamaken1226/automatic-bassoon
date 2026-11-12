"use client";

import { Plus, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { secondaryButton } from "@/components/ui/styles";
import { dayOf, durationMinutes } from "@/lib/attendance";
import { formatDateShort, formatMinutes, formatTime } from "@/lib/date";
import { fetchAll, type StudyData } from "@/lib/study";
import { useStudy } from "@/lib/use-study";
import { useToday } from "@/lib/use-today";
import type { AttendanceKind, AttendanceRecord } from "@/lib/types";
import { ErrorNote } from "../study/shared";
import { KindManager } from "./kind-manager";
import { RecordEditor } from "./record-editor";
import { Stats } from "./stats";
import { TimerCard } from "./timer-card";

const PAGE_SIZE = 30;

/** 記録の内訳（取り組み / 科目 / 教材、または曲） */
export function recordDetail(r: AttendanceRecord, data: StudyData): string {
  const parts = [
    data.initiatives.find((i) => i.id === r.initiative_id)?.name,
    data.subjects.find((s) => s.id === r.subject_id)?.name,
    data.materials.find((m) => m.id === r.material_id)?.name,
    data.songs.find((s) => s.id === r.song_id)?.title,
  ].filter(Boolean);
  return parts.join(" / ") + (r.page_reached !== null ? `（p.${r.page_reached}まで）` : "");
}

export function AttendanceApp() {
  const store = useStudy();
  const { sb, data, kinds } = store;
  const today = useToday();
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [editor, setEditor] = useState<AttendanceRecord | "new" | null>(null);
  const [showKinds, setShowKinds] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const { setError } = store;

  const loadRecords = useCallback(async () => {
    try {
      const rows = await fetchAll<AttendanceRecord>((from, to) =>
        sb.from("attendance_records").select("*").order("started_at", { ascending: false }).range(from, to),
      );
      setRecords(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sb, setError]);

  useEffect(() => {
    Promise.resolve().then(loadRecords);
    // 別の端末で開始・終了したときのために、画面に戻ってきたら読み込み直す
    const onVisible = () => document.visibilityState === "visible" && loadRecords();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadRecords]);

  /** 記録に関する操作を実行して読み込み直す */
  const act = useCallback(
    async (fn: () => PromiseLike<{ error: { message: string; code?: string } | null } | void>): Promise<boolean> => {
      const res = await fn();
      if (res && res.error) {
        setError(res.error.code === "23505" ? "すでに記録中のものがあります（同時に記録できるのは1件だけです）" : res.error.message);
        await loadRecords();
        return false;
      }
      setError(null);
      await Promise.all([loadRecords(), store.reload()]);
      return true;
    },
    [loadRecords, setError, store],
  );

  const kindById = useMemo(() => new Map(kinds.map((k) => [k.id, k])), [kinds]);
  const finished = useMemo(() => (records ?? []).filter((r) => r.ended_at), [records]);
  const running = records?.find((r) => r.is_running) ?? null;

  if (!data || !records || !today) {
    return (
      <>
        <PageHeader title="勤怠" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  // 日ごとにまとめた記録一覧
  const groups: { day: string; records: AttendanceRecord[] }[] = [];
  for (const r of finished.slice(0, shown)) {
    const day = dayOf(r);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.records.push(r);
    else groups.push({ day, records: [r] });
  }

  const kindChip = (kind: AttendanceKind | undefined) => (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="size-2.5 rounded-full" style={{ background: kind?.color ?? "var(--muted)" }} />
      {kind?.name ?? "（削除された種類）"}
    </span>
  );

  return (
    <>
      <PageHeader title="勤怠" />
      <ErrorNote error={store.error} />

      <TimerCard running={running} kinds={kinds} data={data} sb={sb} act={act} />

      <Stats records={finished} kinds={kinds} data={data} today={today} />

      <section aria-label="記録一覧" className="mt-6">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted">記録</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowKinds(true)} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
              <Settings2 className="size-4" aria-hidden />
              種類
            </button>
            <button type="button" onClick={() => setEditor("new")} className={`${secondaryButton} inline-flex items-center gap-1`}>
              <Plus className="size-4" aria-hidden />
              手動で追加
            </button>
          </div>
        </div>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">記録はまだありません</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.day}>
                <h3 className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{g.day === today ? "今日" : formatDateShort(g.day, today)}</span>
                  <span className="text-muted">{formatMinutes(g.records.reduce((sum, r) => sum + durationMinutes(r), 0))}</span>
                </h3>
                <ul className="rounded-xl border border-border bg-card">
                  {g.records.map((r) => {
                    const detail = recordDetail(r, data);
                    return (
                      <li key={r.id} className="border-b border-border last:border-b-0">
                        <button type="button" onClick={() => setEditor(r)} className="block w-full px-3 py-2.5 text-left">
                          <span className="flex flex-wrap items-center justify-between gap-x-3">
                            {kindChip(kindById.get(r.kind_id))}
                            <span className="text-sm">
                              {formatTime(r.started_at)}〜{formatTime(r.ended_at!)}
                              <span className="ml-2 font-semibold">{formatMinutes(durationMinutes(r))}</span>
                            </span>
                          </span>
                          {detail && <span className="mt-0.5 block text-xs text-muted">{detail}</span>}
                          {r.memo && <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm">{r.memo}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {finished.length > shown && (
              <button type="button" onClick={() => setShown(shown + PAGE_SIZE)} className={`${secondaryButton} w-full`}>
                さらに表示
              </button>
            )}
          </div>
        )}
      </section>

      {editor && (
        <RecordEditor record={editor === "new" ? null : editor} kinds={kinds} data={data} sb={sb} act={act} onClose={() => setEditor(null)} />
      )}
      {showKinds && <KindManager kinds={kinds} store={store} onClose={() => setShowKinds(false)} />}
    </>
  );
}

export type Act = (
  fn: () => PromiseLike<{ error: { message: string; code?: string } | null } | void>,
) => Promise<boolean>;
