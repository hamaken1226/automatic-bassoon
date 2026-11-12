"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BOTTOM_NAV_ITEMS, MENU_ITEMS, isActive } from "@/lib/nav";

const itemClass = (active: boolean) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
    active ? "font-semibold text-accent" : "text-muted"
  }`;

/** スマホ用: 画面下部のメニュー。「メニュー」から残りの機能に移動する */
export function BottomNav({ signOutSlot }: { signOutSlot: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuActive = MENU_ITEMS.some((i) => isActive(pathname, i.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="メニュー">
          <button
            type="button"
            aria-label="メニューを閉じる"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card px-4 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">メニュー</h2>
              <button
                type="button"
                aria-label="閉じる"
                className="rounded-full p-2 text-muted"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border border-border px-2 py-4 text-xs ${
                      active ? "bg-accent-soft font-semibold text-accent" : ""
                    }`}
                  >
                    <Icon className="size-5" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 border-t border-border pt-2">{signOutSlot}</div>
          </div>
        </div>
      )}

      <nav
        aria-label="メインメニュー"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = !open && isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={itemClass(active)}
            >
              <Icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={itemClass(open || menuActive)}
        >
          <Menu className="size-5" aria-hidden />
          メニュー
        </button>
      </nav>
    </>
  );
}
