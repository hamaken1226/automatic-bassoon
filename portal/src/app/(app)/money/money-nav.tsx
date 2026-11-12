"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/money", label: "概要" },
  { href: "/money/transactions", label: "記録一覧" },
  { href: "/money/loans", label: "貸し" },
  { href: "/money/cards", label: "クレカ照合" },
  { href: "/money/check", label: "月次チェック" },
  { href: "/money/reports", label: "推移" },
];

/** お金の各ページへのタブ（スマホでも移動しやすいように） */
export function MoneyNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="お金のメニュー" className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-1 rounded-xl border border-border bg-card p-1 text-sm">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded-lg px-3 py-1.5 ${active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:text-foreground"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
