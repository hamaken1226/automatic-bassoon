import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** ホームのカード。見出しから各機能のページに移動できる */
export function HomeCard({ title, href, children, className = "" }: { title: string; href?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`flex flex-col rounded-xl border border-border bg-card p-4 ${className}`}>
      {href ? (
        <Link href={href} className="mb-2 flex items-center justify-between gap-2 font-semibold hover:text-accent">
          {title}
          <ChevronRight className="size-4 text-muted" aria-hidden />
        </Link>
      ) : (
        <h2 className="mb-2 font-semibold">{title}</h2>
      )}
      {children}
    </section>
  );
}

export function CardError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-sm text-danger">読み込めませんでした（{error}）</p>;
}

export function Loading() {
  return <p className="text-sm text-muted">読み込み中…</p>;
}
