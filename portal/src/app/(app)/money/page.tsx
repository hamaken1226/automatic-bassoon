import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { NAV_ITEMS } from "@/lib/nav";

export const metadata: Metadata = { title: "お金" };

const children = NAV_ITEMS.find((i) => i.href === "/money")?.children ?? [];

export default function Page() {
  return (
    <>
      <PageHeader title="お金" description="この機能は準備中です（フェーズ4で実装します）" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-xl border border-border bg-card p-4 text-sm font-semibold hover:border-accent"
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
