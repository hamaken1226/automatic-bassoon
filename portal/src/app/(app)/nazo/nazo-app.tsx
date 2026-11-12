"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { GimmicksTab } from "./gimmicks-tab";
import { IdeasTab } from "./ideas-tab";
import { PerformancesTab } from "./performances-tab";

const TABS = [
  { key: "ideas", label: "小謎アイデア" },
  { key: "shows", label: "公演の経験" },
  { key: "gimmicks", label: "ギミック" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function NazoApp() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "ideas") as Tab;

  return (
    <>
      <PageHeader title="謎解きメモ" />
      <div role="tablist" aria-label="謎解きメモの種類" className="mb-4 grid grid-cols-3 rounded-xl border border-border bg-card p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => router.replace(t.key === "ideas" ? "/nazo" : `/nazo?tab=${t.key}`, { scroll: false })}
            className={`rounded-lg py-2 ${tab === t.key ? "bg-accent-soft font-semibold text-accent" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "ideas" && <IdeasTab />}
      {tab === "shows" && <PerformancesTab />}
      {tab === "gimmicks" && <GimmicksTab />}
    </>
  );
}
