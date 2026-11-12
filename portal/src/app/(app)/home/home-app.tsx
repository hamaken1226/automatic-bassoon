"use client";

import { Check, Flame } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dayOf, durationMinutes, minutesByDay, streak } from "@/lib/attendance";
import { addDays, formatDateLong, formatDateShort, formatMinutes } from "@/lib/date";
import { formatBand, overallBand, SKILL_LABEL, SKILLS } from "@/lib/ielts";
import { monthTotals } from "@/lib/money";
import { isActiveOn, PLAN_STATUS_LABEL, planStatus, targetPage } from "@/lib/plans";
import { fetchAll, nextBandPractice } from "@/lib/study";
import { completeTask, TASK_SELECT } from "@/lib/tasks";
import type { AttendanceRecord, TaskWithDetails } from "@/lib/types";
import { useIelts } from "@/lib/use-ielts";
import { useMoney } from "@/lib/use-money";
import { useStudy } from "@/lib/use-study";
import { useToday } from "@/lib/use-today";
import { TimerCard } from "../attendance/timer-card";
import { latestBySkill } from "../ielts/ielts-app";
import { cardPeriodInfos, nextPayment, PERIOD_STATUS_LABEL } from "../money/card-status";
import { Yen } from "../money/money-shared";
import { daysLeftLabel } from "../study/shared";
import { CalendarCard } from "./calendar-card";
import { CardError, HomeCard, Loading } from "./home-card";

export function HomeApp() {
  const today = useToday();
  const study = useStudy();
  const money = useMoney();
  const ielts = useIelts();
  const { sb } = study;
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskWithDetails[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    try {
      setRecords(
        await fetchAll<AttendanceRecord>((from, to) => sb.from("attendance_records").select("*").order("started_at", { ascending: false }).range(from, to)),
      );
      setRecordsError(null);
    } catch (e) {
      setRecordsError((e as Error).message);
    }
  }, [sb]);

  const loadTasks = useCallback(async () => {
    const { data, error } = await sb.from("tasks").select(TASK_SELECT).eq("status", "open").not("due_date", "is", null);
    if (error) setTasksError(error.message);
    else setTasks(data as TaskWithDetails[]);
  }, [sb]);

  useEffect(() => {
    Promise.resolve().then(() => Promise.all([loadRecords(), loadTasks()]));
    // 別の端末で操作したときのために、画面に戻ってきたら読み込み直す
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadRecords();
        loadTasks();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadRecords, loadTasks]);

  const act = useCallback(
    async (fn: () => PromiseLike<{ error: { message: string; code?: string } | null } | void>) => {
      const res = await fn();
      if (res && res.error) {
        setRecordsError(res.error.code === "23505" ? "すでに記録中のものがあります" : res.error.message);
        await loadRecords();
        return false;
      }
      setRecordsError(null);
      await Promise.all([loadRecords(), study.reload()]);
      return true;
    },
    [loadRecords, study],
  );

  const finished = useMemo(() => (records ?? []).filter((r) => r.ended_at), [records]);

  if (!today) return <Loading />;

  // ---- 勉強・練習 ----
  const studyKindIds = new Set(study.kinds.filter((k) => k.special === "study").map((k) => k.id));
  const studyRecords = finished.filter((r) => studyKindIds.has(r.kind_id));
  const todayStudy = studyRecords.filter((r) => dayOf(r) === today).reduce((sum, r) => sum + durationMinutes(r), 0);
  const studyStreak = streak(new Set(minutesByDay(studyRecords).keys()), today);
  const overallStreak = streak(new Set(minutesByDay(finished).keys()), today);
  const exams = (study.data?.initiatives ?? []).filter((i) => i.type === "exam" && i.exam_date && i.exam_date >= today);
  const plans = (study.data?.plans ?? []).filter((p) => isActiveOn(p, today));
  const band = study.data ? nextBandPractice(study.data.bandPractices, today) : null;
  const running = records?.find((r) => r.is_running) ?? null;

  // ---- タスク ----
  const dueTasks = (tasks ?? [])
    .filter((t) => t.due_date! <= today)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!) || a.created_at.localeCompare(b.created_at));

  const complete = async (task: TaskWithDetails) => {
    setTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
    try {
      const { next } = await completeTask(sb, task);
      if (next) setTasks((prev) => [...(prev ?? []), next]);
    } catch (e) {
      setTasksError((e as Error).message);
      await loadTasks();
    }
  };

  // ---- IELTS ----
  const latest = ielts.data ? latestBySkill(ielts.data.records) : {};
  const overall = overallBand(Object.fromEntries(SKILLS.map((s) => [s, latest[s]?.band ?? null])));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* 1. 日付と勤怠ボタン */}
        <HomeCard title={formatDateLong(today)} className="md:col-span-2 xl:col-span-1">
          <CardError error={recordsError ?? study.error} />
          {study.data && records ? (
            <div className="-mx-4 -mb-4 [&>section]:rounded-t-none [&>section]:border-x-0 [&>section]:border-b-0">
              <TimerCard running={running} kinds={study.kinds} data={study.data} sb={sb} act={act} />
            </div>
          ) : (
            !recordsError && <Loading />
          )}
        </HomeCard>

        {/* 2. 予定 */}
        <CalendarCard />

        {/* 3. タスク */}
        <HomeCard title="タスク" href="/tasks">
          <CardError error={tasksError} />
          {tasks === null ? (
            !tasksError && <Loading />
          ) : dueTasks.length === 0 ? (
            <p className="text-sm text-muted">期限切れ・今日が期限のタスクはありません</p>
          ) : (
            <ul className="-mx-1">
              {dueTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`「${t.title}」を完了にする`}
                    onClick={() => complete(t)}
                    className="group flex size-9 shrink-0 items-center justify-center"
                  >
                    <span className="flex size-5 items-center justify-center rounded-full border-2 border-muted group-hover:border-accent">
                      <Check className="size-3 opacity-0 group-hover:opacity-60" aria-hidden />
                    </span>
                  </button>
                  <Link href="/tasks" className="min-w-0 flex-1 py-1.5 text-sm">
                    <span className="block break-words">{t.title}</span>
                    {t.due_date! < today && <span className="text-xs font-semibold text-danger">{formatDateShort(t.due_date!, today)}（期限切れ）</span>}
                    {t.subtasks.length > 0 && (
                      <span className="ml-2 text-xs text-muted">
                        {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </HomeCard>

        {/* 4. 勉強・練習 */}
        <HomeCard title="勉強・練習" href="/study">
          <CardError error={study.error} />
          {!study.data || !records ? (
            <Loading />
          ) : (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted">今日の勉強時間</p>
                  <p className="text-xl font-bold">{formatMinutes(todayStudy)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">連続記録</p>
                  <p className="flex items-center gap-1 text-xl font-bold">
                    <Flame className={`size-5 ${overallStreak > 0 ? "text-accent" : "text-muted"}`} aria-hidden />
                    {overallStreak}日
                    <span className="text-xs font-normal text-muted">（勉強 {studyStreak}日）</span>
                  </p>
                </div>
              </div>
              {exams.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {exams.map((e) => (
                    <li key={e.id}>
                      <span className="text-muted">{e.name}</span> <span className="font-semibold">{daysLeftLabel(today, e.exam_date!)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <p className="text-xs font-semibold text-muted">今日の計画</p>
                {plans.length === 0 ? (
                  <p className="text-muted">今日の計画はありません</p>
                ) : (
                  <ul className="mt-0.5 space-y-1">
                    {plans.map((p) => {
                      const material = study.data!.materials.find((m) => m.id === p.material_id);
                      const status = planStatus(p, material?.current_page ?? 0, today, addDays(today, -1));
                      return (
                        <li key={p.id} className="flex flex-wrap justify-between gap-x-2">
                          <span className="min-w-0 break-words">
                            {material?.name} {p.content}
                          </span>
                          <span className="shrink-0">
                            p.{targetPage(p, today)}まで
                            <span className={`ml-1.5 text-xs ${status === "behind" ? "font-semibold text-danger" : "text-muted"}`}>{PLAN_STATUS_LABEL[status]}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {band && (
                <p>
                  <span className="text-muted">次のバンド練習</span> <span className="font-semibold">{daysLeftLabel(today, band.date)}</span>
                  {band.band_practice_songs.length > 0 && (
                    <span className="block text-xs text-muted">
                      {band.band_practice_songs.map((s) => study.data!.songs.find((x) => x.id === s.song_id)?.title).filter(Boolean).join("、")}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </HomeCard>

        {/* 5. お金 */}
        <HomeCard title="お金" href="/money">
          <CardError error={money.error} />
          {!money.data ? (
            !money.error && <Loading />
          ) : (
            (() => {
              const m = monthTotals(money.data.txs, today.slice(0, 7));
              const loans = money.data.loans.filter((l) => l.status === "open").reduce((s, l) => s + l.amount, 0);
              return (
                <div className="space-y-3 text-sm">
                  <dl className="grid grid-cols-3 gap-2">
                    {[
                      ["今月の収入", m.income],
                      ["今月の支出", m.expense],
                      ["差額", m.diff],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted">{label}</dt>
                        <dd className="font-bold">
                          <Yen value={value as number} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="flex justify-between">
                    <span className="text-muted">未回収の貸し</span>
                    <Yen value={loans} className="font-semibold" />
                  </p>
                  <ul className="space-y-1 border-t border-border pt-2">
                    {money.data.cardSettings.map((s) => {
                      const place = money.data!.places.find((p) => p.id === s.place_id);
                      const next = nextPayment(cardPeriodInfos(s, money.data!.statements, money.data!.txs, today, 2), today);
                      return (
                        <li key={s.id} className="flex flex-wrap justify-between gap-x-2">
                          <span>{place?.name}</span>
                          {next ? (
                            <span>
                              {formatDateShort(next.due, today)}
                              <span
                                className={`ml-1.5 text-xs font-semibold ${next.status === "matched" ? "text-accent" : next.status === "mismatched" ? "text-danger" : "text-muted"}`}
                              >
                                {next.status === "matched" ? "照合済み" : next.status === "mismatched" ? PERIOD_STATUS_LABEL.mismatched : "未照合"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted">支払い予定なし</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()
          )}
        </HomeCard>

        {/* 6. IELTS */}
        <HomeCard title="IELTS" href="/ielts">
          <CardError error={ielts.error} />
          {!ielts.data ? (
            !ielts.error && <Loading />
          ) : (
            <div className="text-sm">
              <p className="flex items-baseline gap-2">
                <span className="text-muted">オーバーオールの目安</span>
                <span className="text-2xl font-bold">{formatBand(overall)}</span>
                <span className="text-xs text-muted">目標 {formatBand(ielts.data.targets.overall)}</span>
              </p>
              <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
                {SKILLS.map((s) => (
                  <div key={s} className="rounded-lg bg-background py-1.5">
                    <dt className="text-[11px] text-muted">{SKILL_LABEL[s]}</dt>
                    <dd className="font-semibold">{formatBand(latest[s]?.band)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </HomeCard>
      </div>
    </>
  );
}
