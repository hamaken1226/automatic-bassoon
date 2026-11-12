"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { iconButton } from "./styles";

/** 画面に重ねて出す入力・編集用のダイアログ。スマホでは全画面に近い形で出す */
export function Modal({
  title,
  onClose,
  children,
  footer,
  className = "",
  noteColor,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** メモの背景色（globals.css の data-note-color） */
  noteColor?: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6">
      <button
        type="button"
        aria-label="閉じる"
        tabIndex={-1}
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-note-color={noteColor ?? undefined}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-xl md:max-w-xl md:rounded-2xl ${className}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" aria-label="閉じる" className={iconButton} onClick={onClose}>
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex items-center gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
