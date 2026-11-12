"use client";

import { ChevronRight, Download, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { secondaryButton } from "@/components/ui/styles";
import { formatDateShort } from "@/lib/date";
import { isActiveOn } from "@/lib/plans";
import { nextBandPractice } from "@/lib/study";
import { useStudy } from "@/lib/use-study";
import { useToday } from "@/lib/use-today";
import { PlanCsvExportButton, PlanCsvImport } from "./plan-csv";
import { daysLeftLabel, ErrorNote, InitiativeEditor, PlanRow } from "./shared";

export function StudyApp() {
  const store = useStudy();
  const today = useToday();
  const { data } = store;
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!data || !today) {
    return (
      <>
        <PageHeader title="勉強・練習スケジュール" />
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }

  const todayPlans = data.plans.filter((p) => isActiveOn(p, today));

  return (
    <>
      <PageHeader title="勉強・練習スケジュール" />
      <ErrorNote error={store.error} />

      <section aria-label="今日の計画" className="mb-6">
        <h2 className="mb-1.5 text-sm font-semibold text-muted">今日の計画</h2>
        {todayPlans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted">
            今日が期間に含まれる計画はありません
          </p>
        ) : (
          <ul className="rounded-xl border border-border bg-card">
            {todayPlans.map((p) => (
              <PlanRow key={p.id} plan={p} data={data} today={today} store={store} showInitiative />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="取り組み" className="mb-6">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">取り組み</h2>
          <button type="button" onClick={() => setAdding(true)} className={`${secondaryButton} inline-flex items-center gap-1`}>
            <Plus className="size-4" aria-hidden />
            追加
          </button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.initiatives.map((i) => {
            const practice = i.type === "practice" ? nextBandPractice(data.bandPractices.filter((b) => b.initiative_id === i.id), today) : null;
            return (
              <li key={i.id}>
                <Link href={`/study/${i.id}`} className="block rounded-xl border border-border bg-card p-4 hover:border-accent">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{i.name}</h3>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </div>
                  {i.type === "exam" ? (
                    i.exam_date ? (
                      <p className="mt-1 text-sm">
                        <span className="text-lg font-bold">{daysLeftLabel(today, i.exam_date)}</span>
                        <span className="ml-2 text-muted">試験日 {formatDateShort(i.exam_date, today)}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">試験日は未設定</p>
                    )
                  ) : practice ? (
                    <p className="mt-1 text-sm">
                      <span className="text-lg font-bold">{daysLeftLabel(today, practice.date)}</span>
                      <span className="ml-2 text-muted">次のバンド練習 {formatDateShort(practice.date, today)}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted">バンド練習の予定はありません</p>
                  )}
                  {i.memo && <p className="mt-1 line-clamp-1 text-xs text-muted">{i.memo}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="計画のCSV" className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">計画のCSV</h2>
        <p className="mt-1 text-xs text-muted">
          1行＝1つの計画。列: 試験, 科目, 教材, 内容, 開始ページ, 終了ページ, 開始日, 終了日
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setImporting(true)} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
            <Upload className="size-4" aria-hidden />
            CSVを取り込む
          </button>
          <PlanCsvExportButton data={data}>
            <Download className="size-4" aria-hidden />
            CSVを書き出す
          </PlanCsvExportButton>
        </div>
      </section>

      {adding && <InitiativeEditor initiative={null} store={store} onClose={() => setAdding(false)} />}
      {importing && <PlanCsvImport data={data} store={store} onClose={() => setImporting(false)} />}
    </>
  );
}
