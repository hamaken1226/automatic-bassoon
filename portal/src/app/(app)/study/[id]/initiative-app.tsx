"use client";

import { ChevronLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { secondaryButton } from "@/components/ui/styles";
import { useStudy } from "@/lib/use-study";
import { useToday } from "@/lib/use-today";
import { ErrorNote, InitiativeEditor } from "../shared";
import { ExamView } from "./exam-view";
import { PracticeView } from "./practice-view";

export function InitiativeApp() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStudy();
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const initiative = store.data?.initiatives.find((i) => i.id === id);

  const back = (
    <Link href="/study" className="mb-2 inline-flex items-center gap-1 text-sm text-accent">
      <ChevronLeft className="size-4" aria-hidden />
      勉強・練習スケジュール
    </Link>
  );

  if (!store.data || !today) {
    return (
      <>
        {back}
        <ErrorNote error={store.error} />
        <p className="text-sm text-muted">読み込み中…</p>
      </>
    );
  }
  if (!initiative) {
    return (
      <>
        {back}
        <p className="text-sm text-muted">この取り組みは見つかりませんでした</p>
      </>
    );
  }

  return (
    <>
      {back}
      <div className="flex items-start justify-between gap-2">
        <PageHeader title={initiative.name} description={initiative.memo || undefined} />
        <button type="button" onClick={() => setEditing(true)} className={`${secondaryButton} inline-flex shrink-0 items-center gap-1.5`}>
          <Pencil className="size-4" aria-hidden />
          編集
        </button>
      </div>
      {!editing && <ErrorNote error={store.error} />}

      {initiative.type === "exam" ? (
        <ExamView initiative={initiative} data={store.data} store={store} today={today} />
      ) : (
        <PracticeView initiative={initiative} data={store.data} store={store} today={today} />
      )}

      {editing && (
        <InitiativeEditor
          initiative={initiative}
          store={store}
          onClose={() => setEditing(false)}
          onDeleted={() => router.push("/study")}
        />
      )}
    </>
  );
}
