"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { addDays, diffDays, formatDateShort } from "@/lib/date";
import { pagesPerDay, PLAN_STATUS_LABEL, planStatus, targetPage, type PlanStatus } from "@/lib/plans";
import type { StudyData } from "@/lib/study";
import type { StudyStore } from "@/lib/use-study";
import type { Initiative, Plan } from "@/lib/types";

/** 「あと12日」「今日」「3日前」 */
export function daysLeftLabel(today: string, date: string): string {
  const d = diffDays(today, date);
  return d > 0 ? `あと${d}日` : d === 0 ? "今日" : `${-d}日前`;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-3 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );
}

const STATUS_CLASS: Record<PlanStatus, string> = {
  before: "bg-black/5 text-muted dark:bg-white/10",
  on_track: "bg-accent-soft text-accent",
  ahead: "bg-accent text-accent-foreground",
  behind: "border border-danger text-danger",
  done: "bg-black/5 text-muted dark:bg-white/10",
};

/** 計画1件の表示: 内容・期間・1日あたりのページ・今日の目標・実績（手入力で更新できる） */
export function PlanRow({
  plan,
  data,
  today,
  store,
  showInitiative = false,
  onEdit,
}: {
  plan: Plan;
  data: StudyData;
  today: string;
  store: StudyStore;
  showInitiative?: boolean;
  onEdit?: () => void;
}) {
  const material = data.materials.find((m) => m.id === plan.material_id);
  const subject = data.subjects.find((s) => s.id === plan.subject_id);
  const initiative = data.initiatives.find((i) => i.id === subject?.initiative_id);
  const actual = material?.current_page ?? 0;
  const status = planStatus(plan, actual, today, addDays(today, -1));
  const target = targetPage(plan, today);
  const perDay = pagesPerDay(plan);
  const active = plan.start_date <= today && today <= plan.end_date;

  return (
    <li className="border-b border-border px-3 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="break-words font-semibold">
            {plan.content || "（内容なし）"}
            <span className="ml-2 text-sm font-normal text-muted">
              p.{plan.start_page}〜{plan.end_page}
            </span>
          </p>
          <p className="text-xs text-muted">
            {showInitiative && initiative ? `${initiative.name} / ` : ""}
            {subject?.name} / {material?.name}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
          {PLAN_STATUS_LABEL[status]}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted">
          {formatDateShort(plan.start_date, today)}〜{formatDateShort(plan.end_date, today)}
        </span>
        <span className="text-muted">1日あたり約{Math.round(perDay * 10) / 10}ページ</span>
        {active && <span className="font-semibold">今日の目標: p.{target}</span>}
        <label className="ml-auto flex items-center gap-1.5">
          <span className="text-muted">実績 p.</span>
          <input
            key={actual}
            type="number"
            min={0}
            inputMode="numeric"
            aria-label={`「${material?.name}」の実績ページ`}
            defaultValue={actual}
            onBlur={(e) => {
              const v = Math.max(0, Math.floor(Number(e.target.value)));
              if (!material || !Number.isFinite(v) || v === actual) return;
              store.mutate(() => store.sb.from("materials").update({ current_page: v }).eq("id", material.id));
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className={`${inputClass} w-20 px-2 py-1 text-right`}
          />
        </label>
        {onEdit && (
          <button type="button" onClick={onEdit} className={`${secondaryButton} px-2 py-1 text-xs`}>
            編集
          </button>
        )}
      </div>
    </li>
  );
}

/** 取り組みの追加・編集 */
export function InitiativeEditor({
  initiative,
  store,
  onClose,
  onDeleted,
}: {
  initiative: Initiative | null;
  store: StudyStore;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [name, setName] = useState(initiative?.name ?? "");
  const [type, setType] = useState<Initiative["type"]>(initiative?.type ?? "exam");
  const [examDate, setExamDate] = useState(initiative?.exam_date ?? "");
  const [memo, setMemo] = useState(initiative?.memo ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError("名前を入力してください");
    const values = { name: name.trim(), type, exam_date: type === "exam" ? examDate || null : null, memo };
    const ok = await store.mutate(() =>
      initiative
        ? store.sb.from("initiatives").update(values).eq("id", initiative.id)
        : store.sb.from("initiatives").insert({ ...values, sort_order: store.data?.initiatives.length ?? 0 }),
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!initiative) return;
    if (
      !window.confirm(
        `取り組み「${initiative.name}」を削除しますか？\n科目・教材・計画・曲・練習ログもすべて削除されます。元に戻せません。`,
      )
    ) {
      return;
    }
    const ok = await store.mutate(() => store.sb.from("initiatives").delete().eq("id", initiative.id));
    if (ok) onDeleted?.();
  };

  return (
    <Modal
      title={initiative ? "取り組みを編集" : "取り組みを追加"}
      onClose={onClose}
      footer={
        <>
          {initiative && (
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
          <span className={labelClass}>名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        {!initiative && (
          <label className="block">
            <span className={labelClass}>タイプ</span>
            <select value={type} onChange={(e) => setType(e.target.value as Initiative["type"])} className={inputClass}>
              <option value="exam">試験（科目 → 教材 → 計画）</option>
              <option value="practice">練習（曲目・バンド練習日）</option>
            </select>
          </label>
        )}
        {type === "exam" && (
          <label className="block">
            <span className={labelClass}>試験日</span>
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className={inputClass} />
          </label>
        )}
        <label className="block">
          <span className={labelClass}>メモ</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className={`${inputClass} [field-sizing:content] min-h-20`} />
        </label>
      </div>
    </Modal>
  );
}

