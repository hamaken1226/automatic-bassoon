"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { iconButton, inputClass, primaryButton } from "@/components/ui/styles";
import { KIND_COLORS } from "@/lib/study";
import type { StudyStore } from "@/lib/use-study";
import type { AttendanceKind } from "@/lib/types";

const SPECIAL_LABEL: Record<AttendanceKind["special"], string> = {
  study: "取り組み・科目・教材を選ぶ",
  drum: "曲を選ぶ",
  none: "",
};

/** 勤怠の種類の追加・編集・削除 */
export function KindManager({ kinds, store, onClose }: { kinds: AttendanceKind[]; store: StudyStore; onClose: () => void }) {
  const { sb } = store;
  const nextColor = KIND_COLORS.find((c) => !kinds.some((k) => k.color === c)) ?? KIND_COLORS[kinds.length % KIND_COLORS.length];
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => PromiseLike<{ error: { message: string; code?: string } | null }>) => {
    const { error } = await fn();
    if (error) {
      setError(error.code === "23503" ? "この種類を使っている記録があるため削除できません" : error.message);
      return false;
    }
    setError(null);
    await store.reload();
    return true;
  };

  const add = async () => {
    if (!name.trim()) return;
    if (await run(() => sb.from("attendance_kinds").insert({ name: name.trim(), color: nextColor, sort_order: kinds.length }))) {
      setName("");
    }
  };

  return (
    <Modal title="種類の管理" onClose={onClose}>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {kinds.map((k) => (
          <li key={k.id}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`「${k.name}」の色`}
                defaultValue={k.color}
                onBlur={(e) => e.target.value !== k.color && run(() => sb.from("attendance_kinds").update({ color: e.target.value }).eq("id", k.id))}
                className="size-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
              />
              <input
                key={k.name}
                aria-label="種類の名前"
                defaultValue={k.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== k.name) run(() => sb.from("attendance_kinds").update({ name: v }).eq("id", k.id));
                  else e.target.value = k.name;
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={inputClass}
              />
              <button
                type="button"
                aria-label={`「${k.name}」を削除`}
                className={iconButton}
                onClick={() => window.confirm(`種類「${k.name}」を削除しますか？`) && run(() => sb.from("attendance_kinds").delete().eq("id", k.id))}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
            {SPECIAL_LABEL[k.special] && <p className="ml-11 mt-0.5 text-xs text-muted">記録するときに{SPECIAL_LABEL[k.special]}</p>}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-4 flex items-center gap-2 border-t border-border pt-4"
      >
        <span className="size-9 shrink-0 rounded-lg border border-border" style={{ background: nextColor }} />
        <input aria-label="新しい種類の名前" placeholder="新しい種類" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <button type="submit" disabled={!name.trim()} className={`${primaryButton} inline-flex shrink-0 items-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          追加
        </button>
      </form>
    </Modal>
  );
}
