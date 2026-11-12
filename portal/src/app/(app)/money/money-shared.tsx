"use client";

import { inputClass } from "@/components/ui/styles";
import { formatYen } from "@/lib/money";

export { ErrorNote } from "../study/shared";

/** 金額の入力欄（スマホでは数字キーボード） */
export function AmountInput({
  value,
  onChange,
  label,
  allowNegative = false,
  large = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  allowNegative?: boolean;
  large?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        aria-label={label}
        inputMode={allowNegative ? "text" : "numeric"}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-9 text-right tabular-nums ${large ? "py-3 text-2xl font-bold" : ""}`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">円</span>
    </div>
  );
}

/** 金額の表示。マイナスは色を変える */
export function Yen({ value, className = "", signed = false }: { value: number; className?: string; signed?: boolean }) {
  const text = signed && value > 0 ? `+${formatYen(value)}` : formatYen(value);
  return <span className={`tabular-nums ${value < 0 ? "text-danger" : ""} ${className}`}>{text}</span>;
}
