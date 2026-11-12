"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { formatTime } from "@/lib/date";
import type { StudyData } from "@/lib/study";
import type { AttendanceKind, AttendanceRecord } from "@/lib/types";
import { recordDetail, type Act } from "./attendance-app";
import { DetailFields, detailValues, EMPTY_DETAIL, type Detail } from "./detail-fields";

const LAST_KEY = "attendance:last";

/** 経過時間を「1:23:45」の形式で */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return <>{now === null ? "…" : formatElapsed(now - new Date(since).getTime())}</>;
}

/** 開始・終了ボタン。記録中の状態はDBにあるので、別の端末で終了することもできる */
export function TimerCard({
  running,
  kinds,
  data,
  sb,
  act,
}: {
  running: AttendanceRecord | null;
  kinds: AttendanceKind[];
  data: StudyData;
  sb: SupabaseClient;
  act: Act;
}) {
  const [kindId, setKindId] = useState("");
  const [detail, setDetail] = useState<Detail>(EMPTY_DETAIL);
  const [memo, setMemo] = useState("");
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);

  // 前回選んだ種類・取り組みを初期値にする
  useEffect(() => {
    const restore = setTimeout(() => {
      try {
        const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as { kindId: string; detail: Detail } | null;
        if (last) {
          setKindId(last.kindId);
          setDetail({ ...EMPTY_DETAIL, ...last.detail });
        }
      } catch {
        // 保存内容が壊れていたら無視する
      }
    }, 0);
    return () => clearTimeout(restore);
  }, []);

  const kind = kinds.find((k) => k.id === kindId) ?? kinds[0];

  const start = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ kindId: kind.id, detail }));
    } catch {
      // 保存できなくても記録は続ける
    }
    const ok = await act(() =>
      sb.from("attendance_records").insert({
        kind_id: kind.id,
        started_at: new Date().toISOString(),
        is_running: true,
        memo: memo.trim(),
        ...detailValues(kind, detail),
      }),
    );
    if (ok) setMemo("");
    setBusy(false);
  };

  if (running) {
    const runningKind = kinds.find((k) => k.id === running.kind_id);
    const material = data.materials.find((m) => m.id === running.material_id);
    const detailText = recordDetail(running, data);
    return (
      <section aria-label="記録中" className="rounded-xl border-2 border-accent bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm">
              <span className="size-2.5 animate-pulse rounded-full" style={{ background: runningKind?.color ?? "var(--accent)" }} />
              <span className="font-semibold">{runningKind?.name ?? "記録中"}</span>
              <span className="text-muted">{formatTime(running.started_at)} から記録中</span>
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums" aria-live="off">
              <Elapsed since={running.started_at} />
            </p>
            {detailText && <p className="mt-1 text-sm text-muted">{detailText}</p>}
          </div>
          <button
            type="button"
            onClick={() => setEnding(true)}
            className="inline-flex h-14 items-center gap-2 rounded-xl bg-accent px-8 text-lg font-bold text-accent-foreground"
          >
            <Square className="size-5" fill="currentColor" aria-hidden />
            終了
          </button>
        </div>
        {ending && (
          <EndDialog
            record={running}
            materialName={material?.name ?? null}
            currentPage={material?.current_page ?? null}
            onClose={() => setEnding(false)}
            onEnd={async (page, endMemo) => {
              const ok = await act(async () => {
                const res = await sb
                  .from("attendance_records")
                  .update({ ended_at: new Date().toISOString(), is_running: false, page_reached: page, memo: endMemo })
                  .eq("id", running.id);
                if (res.error || page === null || !material) return res;
                // 進んだページを勉強スケジュールの実績に反映する
                return sb.from("materials").update({ current_page: page }).eq("id", material.id);
              });
              if (ok) setEnding(false);
            }}
          />
        )}
      </section>
    );
  }

  return (
    <section aria-label="記録を開始" className="rounded-xl border border-border bg-card p-4">
      {kinds.length === 0 ? (
        <p className="text-sm text-muted">先に「種類」を追加してください</p>
      ) : (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="種類" className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={k.id === kind?.id}
                onClick={() => setKindId(k.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
                  k.id === kind?.id ? "border-accent bg-accent-soft font-semibold" : "border-border"
                }`}
              >
                <span className="size-2.5 rounded-full" style={{ background: k.color }} />
                {k.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-bold text-accent-foreground disabled:opacity-60"
          >
            <Play className="size-5" fill="currentColor" aria-hidden />
            開始
          </button>
          <DetailFields kind={kind} data={data} value={detail} onChange={setDetail} />
          <label className="block">
            <span className={labelClass}>メモ（任意）</span>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputClass} />
          </label>
        </div>
      )}
    </section>
  );
}

function EndDialog({
  record,
  materialName,
  currentPage,
  onClose,
  onEnd,
}: {
  record: AttendanceRecord;
  materialName: string | null;
  currentPage: number | null;
  onClose: () => void;
  onEnd: (page: number | null, memo: string) => Promise<void>;
}) {
  const [page, setPage] = useState("");
  const [memo, setMemo] = useState(record.memo);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="記録を終了"
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className={secondaryButton}>
            まだ続ける
          </button>
          <button
            type="button"
            disabled={busy}
            className={primaryButton}
            onClick={async () => {
              setBusy(true);
              await onEnd(page === "" ? null : Math.max(0, Math.floor(Number(page))), memo.trim());
              setBusy(false);
            }}
          >
            終了する
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {materialName && (
          <label className="block">
            <span className={labelClass}>
              「{materialName}」は何ページまで進みましたか？（任意。現在の実績: p.{currentPage ?? 0}）
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label="何ページまで進んだか"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        <label className="block">
          <span className={labelClass}>メモ</span>
          <textarea
            aria-label="メモ"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className={`${inputClass} [field-sizing:content] min-h-16`}
          />
        </label>
      </div>
    </Modal>
  );
}
