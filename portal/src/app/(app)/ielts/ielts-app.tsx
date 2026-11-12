"use client";

import { Check, Copy, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LineChart } from "@/components/line-chart";
import { PageHeader } from "@/components/page-header";
import { primaryButton, secondaryButton } from "@/components/ui/styles";
import { durationMinutes, minutesBetween, minutesByDay, periods } from "@/lib/attendance";
import { formatDateShort, formatMinutes } from "@/lib/date";
import { formatBand, overallBand, SKILL_LABEL, SKILLS, type Skill } from "@/lib/ielts";
import { isActiveOn } from "@/lib/plans";
import type { IeltsRecord } from "@/lib/types";
import { useIelts, type IeltsData, type IeltsStore } from "@/lib/use-ielts";
import { useStudy } from "@/lib/use-study";
import { useToday } from "@/lib/use-today";
import { daysLeftLabel, ErrorNote, PlanRow } from "../study/shared";
import { RecordForm } from "./record-form";
import { SpeakingImport } from "./speaking-import";
import { SpeakingTool } from "./speaking-tool";

type Tab = "overview" | Skill;

const BAND_TICKS = [4, 5, 6, 7, 8, 9];

/** 技能ごとの直近の記録（日付が新しいもの） */
export function latestBySkill(records: IeltsRecord[]): Partial<Record<Skill, IeltsRecord>> {
  const latest: Partial<Record<Skill, IeltsRecord>> = {};
  for (const r of records) {
    if (r.band == null) continue;
    const cur = latest[r.skill];
    if (!cur || r.date > cur.date || (r.date === cur.date && r.created_at > cur.created_at)) latest[r.skill] = r;
  }
  return latest;
}

/** 記録した順（同じ日はツールの記録時刻、なければ作成時刻の順） */
const byOrder = (a: IeltsRecord, b: IeltsRecord) =>
  a.date.localeCompare(b.date) || (a.details.recorded_at ?? a.created_at).localeCompare(b.details.recorded_at ?? b.created_at);

function bandPoints(records: IeltsRecord[], skill: Skill) {
  return records
    .filter((r) => r.skill === skill && r.band != null)
    .sort(byOrder)
    .map((r) => ({ date: r.date, value: r.band!, label: r.source || undefined }));
}

function BandChart({ data, skill, today }: { data: IeltsData; skill: Skill; today: string }) {
  return (
    <LineChart
      series={[{ name: SKILL_LABEL[skill], color: "var(--series-1)", points: bandPoints(data.records, skill) }]}
      min={4}
      max={9}
      ticks={BAND_TICKS}
      reference={{ value: data.targets[skill], label: `目標 ${formatBand(data.targets[skill])}` }}
      format={formatBand}
      today={today}
    />
  );
}

export function IeltsApp() {
  const store = useIelts();
  const study = useStudy();
  const today = useToday();
  const router = useRouter();
  const params = useSearchParams();
  const tab = ((["overview", ...SKILLS] as const).find((t) => t === params.get("tab")) ?? "overview") as Tab;
  const [form, setForm] = useState<{ skill: Skill; record: IeltsRecord | null } | null>(null);
  const [copied, setCopied] = useState<Skill | null>(null);
  const { data } = store;

  if (!data || !today) {
    return (
      <>
        <PageHeader title="IELTS" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const latest = latestBySkill(data.records);
  const overall = overallBand(Object.fromEntries(SKILLS.map((s) => [s, latest[s]?.band ?? null])));
  const examDate = data.initiative?.exam_date;

  const copyPrompt = async (skill: "reading" | "listening" | "writing") => {
    try {
      await navigator.clipboard.writeText(data.prompts[skill]);
      setCopied(skill);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("コピーできなかったので、下の文を選んでコピーしてください", data.prompts[skill]);
    }
  };

  const selectTab = (t: Tab) => router.replace(t === "overview" ? "/ielts" : `/ielts?tab=${t}`, { scroll: false });

  return (
    <>
      <PageHeader title="IELTS" description="General Training" />
      <ErrorNote error={store.error} />

      <div role="tablist" aria-label="IELTSの表示" className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-1 rounded-xl border border-border bg-card p-1 text-sm">
          {(["overview", ...SKILLS] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => selectTab(t)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${tab === t ? "bg-accent-soft font-semibold text-accent" : "text-muted"}`}
            >
              {t === "overview" ? "概要" : SKILL_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <Overview data={data} study={study} today={today} latest={latest} overall={overall} examDate={examDate ?? null} onSelect={selectTab} />
      ) : (
        <SkillView
          skill={tab}
          store={store}
          data={data}
          today={today}
          copied={copied === tab}
          onCopy={tab === "speaking" ? undefined : () => copyPrompt(tab)}
          onAdd={() => setForm({ skill: tab, record: null })}
          onEdit={(record) => setForm({ skill: tab, record })}
        />
      )}

      {form && <RecordForm key={form.record?.id ?? "new"} skill={form.skill} record={form.record} store={store} onClose={() => setForm(null)} />}
    </>
  );
}

function Overview({
  data,
  study,
  today,
  latest,
  overall,
  examDate,
  onSelect,
}: {
  data: IeltsData;
  study: ReturnType<typeof useStudy>;
  today: string;
  latest: Partial<Record<Skill, IeltsRecord>>;
  overall: number | null;
  examDate: string | null;
  onSelect: (t: Tab) => void;
}) {
  const plans = study.data && data.initiative
    ? study.data.plans.filter((p) => isActiveOn(p, today) && study.data!.subjects.find((s) => s.id === p.subject_id)?.initiative_id === data.initiative!.id)
    : [];
  const byDay = minutesByDay(data.attendance);
  const p = periods(today);
  const total = data.attendance.reduce((sum, r) => sum + durationMinutes(r), 0);
  const bySubject = data.subjects.map((s) => ({
    name: s.name,
    minutes: data.attendance.filter((r) => r.subject_id === s.id).reduce((sum, r) => sum + durationMinutes(r), 0),
  }));

  return (
    <div className="space-y-4">
      <section aria-label="オーバーオール" className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">オーバーオールの目安</p>
          <p className="text-3xl font-bold">{formatBand(overall)}</p>
          <p className="text-xs text-muted">
            目標 {formatBand(data.targets.overall)}
            {overall === null && "・4技能の記録がそろうと表示"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">試験日</p>
          {examDate ? (
            <>
              <p className="text-3xl font-bold">{daysLeftLabel(today, examDate)}</p>
              <p className="text-xs text-muted">{formatDateShort(examDate, today)}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">勉強・練習の「IELTS」で設定できます</p>
          )}
        </div>
      </section>

      <section aria-label="技能ごとの直近スコア" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SKILLS.map((s) => {
          const r = latest[s];
          const target = data.targets[s];
          const gap = r?.band != null ? r.band - target : null;
          return (
            <button key={s} type="button" onClick={() => onSelect(s)} className="rounded-xl border border-border bg-card p-4 text-left hover:border-accent">
              <span className="block text-sm font-semibold">{SKILL_LABEL[s]}</span>
              <span className="mt-1 block text-2xl font-bold">{formatBand(r?.band)}</span>
              <span className="block text-xs text-muted">
                目標 {formatBand(target)}
                {gap !== null && (gap >= 0 ? <span className="ml-1.5 font-semibold text-accent">達成</span> : <span className="ml-1.5">あと{(-gap).toFixed(1)}</span>)}
              </span>
              {r && <span className="mt-1 block text-[11px] text-muted">{formatDateShort(r.date, today)}</span>}
            </button>
          );
        })}
      </section>

      <section aria-label="バンドスコアの推移" className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">バンドスコアの推移</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {SKILLS.map((s) => (
            <div key={s}>
              <h3 className="mb-1 text-xs font-semibold text-muted">{SKILL_LABEL[s]}</h3>
              <BandChart data={data} skill={s} today={today} />
            </div>
          ))}
        </div>
      </section>

      <section aria-label="IELTSの勉強時間" className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">勉強時間（勤怠の記録から）</h2>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          {[
            ["今週", minutesBetween(byDay, ...p.thisWeek)],
            ["今月", minutesBetween(byDay, ...p.thisMonth)],
            ["累計", total],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold">{formatMinutes(value as number)}</dd>
            </div>
          ))}
        </dl>
        {bySubject.some((s) => s.minutes > 0) && (
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {bySubject.map((s) => (
              <li key={s.name} className="flex justify-between gap-2">
                <span className="text-muted">{s.name}</span>
                <span>{formatMinutes(s.minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="IELTSの今日の計画">
        <h2 className="mb-1.5 text-sm font-semibold text-muted">今日の計画</h2>
        {plans.length === 0 || !study.data ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted">今日が期間に含まれるIELTSの計画はありません</p>
        ) : (
          <ul className="rounded-xl border border-border bg-card">
            {plans.map((plan) => (
              <PlanRow key={plan.id} plan={plan} data={study.data!} today={today} store={study} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SkillView({
  skill,
  store,
  data,
  today,
  copied,
  onCopy,
  onAdd,
  onEdit,
}: {
  skill: Skill;
  store: IeltsStore;
  data: IeltsData;
  today: string;
  copied: boolean;
  onCopy?: () => void;
  onAdd: () => void;
  onEdit: (r: IeltsRecord) => void;
}) {
  const records = data.records.filter((r) => r.skill === skill);
  const summary = (r: IeltsRecord) => {
    const d = r.details;
    if (skill === "reading" || skill === "listening") {
      return [d.correct != null && `${d.correct}/${d.total ?? 40}問`, d.difficulty != null && `難易度 ${formatBand(d.difficulty)}`].filter(Boolean).join("・");
    }
    if (skill === "writing") {
      return [
        `Task ${d.task ?? 2}`,
        d.task_response != null && `${d.task === 1 ? "TA" : "TR"} ${formatBand(d.task_response)}`,
        d.coherence_cohesion != null && `CC ${formatBand(d.coherence_cohesion)}`,
        d.lexical_resource != null && `LR ${formatBand(d.lexical_resource)}`,
        d.grammar != null && `GRA ${formatBand(d.grammar)}`,
      ]
        .filter(Boolean)
        .join("・");
    }
    return [
      d.part && `Part ${d.part}`,
      d.fluency != null && `FC ${formatBand(d.fluency)}`,
      d.speaking_lexical != null && `LR ${formatBand(d.speaking_lexical)}`,
      d.speaking_grammar != null && `GRA ${formatBand(d.speaking_grammar)}`,
      d.pronunciation != null && `P ${formatBand(d.pronunciation)}`,
      d.wpm != null && `${d.wpm} WPM`,
    ]
      .filter(Boolean)
      .join("・");
  };

  const metric = (key: "wpm" | "fillers" | "pauses") =>
    records
      .filter((r) => r.details[key] != null)
      .sort(byOrder)
      .map((r) => ({ date: r.date, value: r.details[key] as number, label: r.details.part ? `Part ${r.details.part}` : undefined }));
  const metricChart = (key: "wpm" | "fillers" | "pauses", title: string) => {
    const points = metric(key);
    const maxValue = Math.max(1, ...points.map((p) => p.value));
    const step = maxValue <= 10 ? 2 : maxValue <= 50 ? 10 : maxValue <= 100 ? 20 : 50;
    const top = Math.ceil(maxValue / step) * step;
    return (
      <div key={key}>
        <h3 className="mb-1 text-xs font-semibold text-muted">{title}</h3>
        <LineChart
          series={[{ name: title, color: "var(--series-1)", points }]}
          min={0}
          max={top}
          ticks={Array.from({ length: top / step + 1 }, (_, i) => i * step)}
          height="h-28"
          today={today}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAdd} className={`${primaryButton} inline-flex items-center gap-1`}>
          <Plus className="size-4" aria-hidden />
          記録する
        </button>
        {onCopy && (
          <button type="button" onClick={onCopy} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
            {copied ? <Check className="size-4 text-accent" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "コピーしました" : "Claude用の指示文をコピー"}
          </button>
        )}
      </div>

      {skill === "speaking" && <SpeakingTool />}
      {skill === "speaking" && <SpeakingImport store={store} />}

      <section aria-label="推移" className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">バンドスコアの推移</h2>
        <BandChart data={data} skill={skill} today={today} />
        {skill === "speaking" && (
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {metricChart("wpm", "WPM")}
            {metricChart("fillers", "フィラー回数")}
            {metricChart("pauses", "1秒以上の沈黙")}
          </div>
        )}
      </section>

      <section aria-label="記録">
        <h2 className="mb-1.5 text-sm font-semibold text-muted">記録</h2>
        {records.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">記録はまだありません</p>
        ) : (
          <ul className="rounded-xl border border-border bg-card">
            {records.map((r) => (
              <li key={r.id} className="border-b border-border last:border-b-0">
                <button type="button" onClick={() => onEdit(r)} className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left">
                  <span className="min-w-0">
                    <span className="block text-sm">
                      {formatDateShort(r.date, today)}
                      {r.source && <span className="ml-2 text-muted">{r.source}</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {summary(r)}
                      {r.minutes ? `・${formatMinutes(r.minutes)}` : ""}
                      {r.import_filename && "・ツールから取り込み"}
                    </span>
                    {r.notes && <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm">{r.notes}</span>}
                  </span>
                  <span className="shrink-0 text-xl font-bold">{formatBand(r.band)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
