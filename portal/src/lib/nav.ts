import {
  CheckSquare,
  Clock,
  GraduationCap,
  Home,
  Languages,
  Puzzle,
  Settings,
  StickyNote,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  children?: { href: string; label: string }[];
};

/** 全機能の一覧（サイドメニューの並び順） */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/tasks", label: "タスク", icon: CheckSquare },
  { href: "/notes", label: "メモ", icon: StickyNote },
  { href: "/attendance", label: "勤怠", icon: Clock },
  { href: "/study", label: "勉強・練習", icon: GraduationCap },
  {
    href: "/money",
    label: "お金",
    icon: Wallet,
    children: [
      { href: "/money/transactions", label: "記録一覧" },
      { href: "/money/loans", label: "貸し" },
      { href: "/money/cards", label: "クレカ照合" },
      { href: "/money/check", label: "月次チェック" },
      { href: "/money/reports", label: "推移・レポート" },
    ],
  },
  { href: "/nazo", label: "謎解きメモ", icon: Puzzle },
  { href: "/ielts", label: "IELTS", icon: Languages },
  { href: "/settings", label: "設定", icon: Settings },
];

/** スマホ下部メニューに常に出す4つ（残りは「メニュー」から） */
export const BOTTOM_NAV_HREFS = ["/", "/tasks", "/attendance", "/money"];

export const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((i) =>
  BOTTOM_NAV_HREFS.includes(i.href),
);
export const MENU_ITEMS = NAV_ITEMS.filter(
  (i) => !BOTTOM_NAV_HREFS.includes(i.href),
);

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

