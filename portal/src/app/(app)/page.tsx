import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { formatJstDateLong } from "@/lib/date";

// カードの並びは固定（仕様 4. ホーム画面）
const CARDS: { title: string; href?: string; phase: number; note: string }[] = [
  { title: "勤怠", href: "/attendance", phase: 5, note: "開始・終了ボタンと記録中の経過時間" },
  { title: "予定", phase: 5, note: "Googleカレンダーの今日〜3日後の予定" },
  { title: "タスク", href: "/tasks", phase: 5, note: "期限切れと今日が期限のタスク" },
  { title: "勉強・練習", href: "/study", phase: 5, note: "今日の勉強時間・今日の計画・次のバンド練習" },
  { title: "お金", href: "/money", phase: 5, note: "今月の収支・未回収の貸し・次のクレカ支払日" },
  { title: "IELTS", href: "/ielts", phase: 5, note: "4技能の直近スコアとオーバーオールの目安" },
];

async function Today() {
  await requireUser();
  return <>{formatJstDateLong()}</>;
}

export default function HomePage() {
  return (
    <>
      <header className="mb-5">
        <p className="text-sm text-muted">今日</p>
        <h1 className="text-2xl font-bold">
          <Suspense fallback={<span className="text-muted">…</span>}>
            <Today />
          </Suspense>
        </h1>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => {
          const body = (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{card.title}</h2>
                {card.href && <ChevronRight className="size-4 text-muted" aria-hidden />}
              </div>
              <p className="mt-2 text-sm text-muted">{card.note}</p>
              <p className="mt-3 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">
                ホームへの表示は準備中（フェーズ{card.phase}）
              </p>
            </>
          );
          const className = "block rounded-xl border border-border bg-card p-4";
          return card.href ? (
            <Link key={card.title} href={card.href} className={`${className} hover:border-accent`}>
              {body}
            </Link>
          ) : (
            <section key={card.title} className={className}>
              {body}
            </section>
          );
        })}
      </div>
    </>
  );
}
