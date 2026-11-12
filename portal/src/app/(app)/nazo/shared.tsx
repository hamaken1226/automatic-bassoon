"use client";

import { Search } from "lucide-react";
import { inputClass } from "@/components/ui/styles";

export { ErrorNote } from "../study/shared";

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input type="search" aria-label="検索" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} pl-9`} />
    </div>
  );
}

/** 文字列の中に検索語が含まれるか（大文字・小文字を区別しない） */
export function matches(query: string, ...texts: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((t) => t?.toLowerCase().includes(q));
}

/** 文中のURLをリンクにする */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
