"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { dangerButton, iconButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/ui/styles";
import { durationMinutes } from "@/lib/attendance";
import { formatDateShort, formatMinutes } from "@/lib/date";
import { isActiveOn, pagesPerDay } from "@/lib/plans";
import { fetchAll, type StudyData } from "@/lib/study";
import type { StudyStore } from "@/lib/use-study";
import type { Initiative, Plan } from "@/lib/types";
import { daysLeftLabel, ErrorNote, PlanRow } from "../shared";

type Props = { initiative: Initiative; data: StudyData; store: StudyStore; today: string };

export function ExamView({ initiative, data, store, today }: Props) {
  const { sb } = store;
  const subjects = data.subjects.filter((s) => s.initiative_id === initiative.id);
  const subjectIds = new Set(subjects.map((s) => s.id));
  const materials = data.materials.filter((m) => subjectIds.has(m.subject_id));
  const plans = data.plans.filter((p) => subjectIds.has(p.subject_id));
  const todayPlans = plans.filter((p) => isActiveOn(p, today));

  const [planEditor, setPlanEditor] = useState<Plan | "new" | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [totalMinutes, setTotalMinutes] = useState<number | null>(null);

  // この取り組みの勉強時間の累計（勤怠の記録から）
  useEffect(() => {
    fetchAll<{ started_at: string; ended_at: string | null }>((from, to) =>
      sb.from("attendance_records").select("started_at, ended_at").eq("initiative_id", initiative.id).range(from, to),
    )
      .then((rows) => setTotalMinutes(rows.reduce((sum, r) => sum + durationMinutes(r), 0)))
      .catch(() => setTotalMinutes(null));
  }, [sb, initiative.id]);

  const addSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    const ok = await store.mutate(() =>
      sb.from("subjects").insert({ initiative_id: initiative.id, name, sort_order: subjects.length }),
    );
    if (ok) setNewSubject("");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">試験日</p>
          {initiative.exam_date ? (
            <>
              <p className="text-2xl font-bold">{daysLeftLabel(today, initiative.exam_date)}</p>
              <p className="text-sm text-muted">{formatDateShort(initiative.exam_date, today)}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">未設定（「編集」から設定できます）</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">勉強時間の累計</p>
          <p className="text-2xl font-bold">{totalMinutes === null ? "…" : formatMinutes(totalMinutes)}</p>
          <p className="text-sm text-muted">勤怠の記録から集計</p>
        </div>
      </div>

      <section aria-label="今日の計画">
        <h2 className="mb-1.5 text-sm font-semibold text-muted">今日の計画</h2>
        {todayPlans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted">
            今日が期間に含まれる計画はありません
          </p>
        ) : (
          <ul className="rounded-xl border border-border bg-card">
            {todayPlans.map((p) => (
              <PlanRow key={p.id} plan={p} data={data} today={today} store={store} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="計画">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">
            計画<span className="ml-2 font-normal">{plans.length}</span>
          </h2>
          <button
            type="button"
            onClick={() => setPlanEditor("new")}
            disabled={subjects.length === 0}
            className={`${secondaryButton} inline-flex items-center gap-1`}
          >
            <Plus className="size-4" aria-hidden />
            計画を追加
          </button>
        </div>
        {plans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted">
            計画はまだありません
          </p>
        ) : (
          <ul className="rounded-xl border border-border bg-card">
            {plans.map((p) => (
              <PlanRow key={p.id} plan={p} data={data} today={today} store={store} onEdit={() => setPlanEditor(p)} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="科目と教材">
        <h2 className="mb-1.5 text-sm font-semibold text-muted">科目と教材</h2>
        <div className="space-y-3">
          {subjects.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <input
                  key={s.name}
                  aria-label="科目名"
                  defaultValue={s.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== s.name) store.mutate(() => sb.from("subjects").update({ name: v }).eq("id", s.id));
                    else e.target.value = s.name;
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 font-semibold outline-none focus:border-accent"
                />
                <button
                  type="button"
                  aria-label={`科目「${s.name}」を削除`}
                  className={iconButton}
                  onClick={() =>
                    window.confirm(`科目「${s.name}」を削除しますか？\nこの科目の教材と計画も削除されます。`) &&
                    store.mutate(() => sb.from("subjects").delete().eq("id", s.id))
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              <ul className="mt-1 space-y-1.5">
                {materials
                  .filter((m) => m.subject_id === s.id)
                  .map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <input
                        key={m.name}
                        aria-label="教材名"
                        defaultValue={m.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== m.name) store.mutate(() => sb.from("materials").update({ name: v }).eq("id", m.id));
                          else e.target.value = m.name;
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className={`${inputClass} min-w-0 flex-1 basis-40 px-2 py-1`}
                      />
                      <label className="flex items-center gap-1 text-muted">
                        実績 p.
                        <input
                          key={m.current_page}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={`「${m.name}」の実績ページ`}
                          defaultValue={m.current_page}
                          onBlur={(e) => {
                            const v = Math.max(0, Math.floor(Number(e.target.value)));
                            if (Number.isFinite(v) && v !== m.current_page) {
                              store.mutate(() => sb.from("materials").update({ current_page: v }).eq("id", m.id));
                            }
                          }}
                          className={`${inputClass} w-20 px-2 py-1 text-right`}
                        />
                      </label>
                      <label className="flex items-center gap-1 text-muted">
                        / 全
                        <input
                          key={m.total_pages ?? ""}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={`「${m.name}」の総ページ数`}
                          defaultValue={m.total_pages ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value)));
                            if (v !== m.total_pages) store.mutate(() => sb.from("materials").update({ total_pages: v }).eq("id", m.id));
                          }}
                          className={`${inputClass} w-20 px-2 py-1 text-right`}
                        />
                        ページ
                      </label>
                      <button
                        type="button"
                        aria-label={`教材「${m.name}」を削除`}
                        className={`${iconButton} size-8`}
                        onClick={() =>
                          window.confirm(`教材「${m.name}」を削除しますか？\nこの教材の計画も削除されます。`) &&
                          store.mutate(() => sb.from("materials").delete().eq("id", m.id))
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
              </ul>
              <AddMaterial subjectId={s.id} subjectName={s.name} store={store} />
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addSubject();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            aria-label="新しい科目名"
            placeholder="科目を追加（科目分けが不要なら「全般」）"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            className={inputClass}
          />
          <button type="submit" disabled={!newSubject.trim()} className={`${secondaryButton} shrink-0`}>
            追加
          </button>
        </form>
      </section>

      {planEditor && (
        <PlanEditor
          plan={planEditor === "new" ? null : planEditor}
          initiative={initiative}
          data={data}
          store={store}
          today={today}
          onClose={() => setPlanEditor(null)}
        />
      )}
    </div>
  );
}

function AddMaterial({ subjectId, subjectName, store }: { subjectId: string; subjectName: string; store: StudyStore }) {
  const [name, setName] = useState("");
  const [pages, setPages] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    const ok = await store.mutate(() =>
      store.sb.from("materials").insert({
        subject_id: subjectId,
        name: name.trim(),
        total_pages: pages === "" ? null : Math.max(0, Math.floor(Number(pages))),
      }),
    );
    if (ok) {
      setName("");
      setPages("");
    }
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
      className="mt-2 flex flex-wrap items-center gap-2 text-sm"
    >
      <input
        aria-label={`「${subjectName}」に追加する教材名`}
        placeholder="教材を追加"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`${inputClass} min-w-0 flex-1 basis-40 px-2 py-1`}
      />
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label="総ページ数"
        placeholder="総ページ"
        value={pages}
        onChange={(e) => setPages(e.target.value)}
        className={`${inputClass} w-24 px-2 py-1`}
      />
      <button type="submit" disabled={!name.trim()} className={`${secondaryButton} px-2 py-1`}>
        追加
      </button>
    </form>
  );
}

/** 計画の追加・編集 */
function PlanEditor({
  plan,
  initiative,
  data,
  store,
  today,
  onClose,
}: Props & { plan: Plan | null; onClose: () => void }) {
  const subjects = data.subjects.filter((s) => s.initiative_id === initiative.id);
  const [subjectId, setSubjectId] = useState(plan?.subject_id ?? subjects[0]?.id ?? "");
  const materials = data.materials.filter((m) => m.subject_id === subjectId);
  const [materialId, setMaterialId] = useState(plan?.material_id ?? "");
  const [newMaterial, setNewMaterial] = useState("");
  const [content, setContent] = useState(plan?.content ?? "");
  const [startPage, setStartPage] = useState(String(plan?.start_page ?? ""));
  const [endPage, setEndPage] = useState(String(plan?.end_page ?? ""));
  const [startDate, setStartDate] = useState(plan?.start_date ?? today);
  const [endDate, setEndDate] = useState(plan?.end_date ?? today);
  const [error, setError] = useState<string | null>(null);

  // 選んだ科目に無い教材が選ばれていたら、その科目の最初の教材にする
  const selectedMaterial = materials.some((m) => m.id === materialId) ? materialId : (materials[0]?.id ?? "new");
  const sp = Number(startPage);
  const ep = Number(endPage);
  const valid = startPage !== "" && endPage !== "" && sp <= ep && startDate && endDate && startDate <= endDate;
  const perDay = valid
    ? pagesPerDay({ start_page: sp, end_page: ep, start_date: startDate, end_date: endDate })
    : null;

  const save = async () => {
    if (!subjectId) return setError("科目を選んでください");
    if (selectedMaterial === "new" && !newMaterial.trim()) return setError("教材名を入力してください");
    if (startPage === "" || endPage === "") return setError("開始ページと終了ページを入力してください");
    if (sp > ep) return setError("開始ページが終了ページより後になっています");
    if (!startDate || !endDate) return setError("開始日と終了日を入力してください");
    if (startDate > endDate) return setError("開始日が終了日より後になっています");
    setError(null);
    const ok = await store.mutate(async () => {
      let mid = selectedMaterial;
      if (mid === "new") {
        const res = await store.sb.from("materials").insert({ subject_id: subjectId, name: newMaterial.trim() }).select("id").single();
        if (res.error) return res;
        mid = (res.data as { id: string }).id;
      }
      const values = {
        subject_id: subjectId,
        material_id: mid,
        content: content.trim(),
        start_page: Math.floor(sp),
        end_page: Math.floor(ep),
        start_date: startDate,
        end_date: endDate,
      };
      return plan ? store.sb.from("plans").update(values).eq("id", plan.id) : store.sb.from("plans").insert(values);
    });
    if (ok) onClose();
  };

  const remove = async () => {
    if (!plan || !window.confirm("この計画を削除しますか？")) return;
    const ok = await store.mutate(() => store.sb.from("plans").delete().eq("id", plan.id));
    if (ok) onClose();
  };

  return (
    <Modal
      title={plan ? "計画を編集" : "計画を追加"}
      onClose={onClose}
      footer={
        <>
          {plan && (
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
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>科目</span>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>教材</span>
            <select value={selectedMaterial} onChange={(e) => setMaterialId(e.target.value)} className={inputClass}>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="new">＋ 新しい教材</option>
            </select>
          </label>
        </div>
        {selectedMaterial === "new" && (
          <label className="block">
            <span className={labelClass}>新しい教材の名前</span>
            <input value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} className={inputClass} />
          </label>
        )}
        <label className="block">
          <span className={labelClass}>内容（例: 第3章）</span>
          <input value={content} onChange={(e) => setContent(e.target.value)} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>開始ページ</span>
            <input type="number" min={0} inputMode="numeric" value={startPage} onChange={(e) => setStartPage(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>終了ページ</span>
            <input type="number" min={0} inputMode="numeric" value={endPage} onChange={(e) => setEndPage(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>開始日</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>終了日</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </label>
        </div>
        {perDay !== null && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
            1日あたり約{Math.round(perDay * 10) / 10}ページ
          </p>
        )}
      </div>
    </Modal>
  );
}
