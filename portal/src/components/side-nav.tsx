"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "@/lib/nav";
import { NoteTagNav } from "./note-tag-nav";

/** PC用: 左のサイドメニュー */
export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="メインメニュー" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                active
                  ? "bg-accent-soft font-semibold text-accent"
                  : "text-foreground hover:bg-accent-soft"
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
            {item.href === "/notes" && active && (
              <div className="my-1 ml-5 border-l border-border pl-3">
                <NoteTagNav />
              </div>
            )}
            {item.children && active && (
              <div className="my-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-3">
                {item.children.map((child) => {
                  const childActive = isActive(pathname, child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      aria-current={childActive ? "page" : undefined}
                      className={`rounded-md px-2 py-1.5 text-sm ${
                        childActive
                          ? "font-semibold text-accent"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
