/** タスクの「機能リンク」で選べるアプリ内のページ */
export const LINK_TARGETS: { key: string; label: string; href: string }[] = [
  { key: "money_check", label: "月次チェック", href: "/money/check" },
  { key: "money_cards", label: "クレカ照合", href: "/money/cards" },
  { key: "money_loans", label: "貸し", href: "/money/loans" },
  { key: "money", label: "お金", href: "/money" },
  { key: "attendance", label: "勤怠", href: "/attendance" },
  { key: "study", label: "勉強・練習", href: "/study" },
  { key: "ielts", label: "IELTS", href: "/ielts" },
  { key: "notes", label: "メモ", href: "/notes" },
  { key: "nazo", label: "謎解きメモ", href: "/nazo" },
];

export function findLinkTarget(key: string | null | undefined) {
  return LINK_TARGETS.find((t) => t.key === key) ?? null;
}
