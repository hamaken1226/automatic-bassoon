"use client";

import { useSyncExternalStore } from "react";
import { todayJst } from "./date";

function subscribe(onChange: () => void) {
  // 画面を開いたまま日付が変わったときに更新する
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

/**
 * 日本時間での今日の日付（YYYY-MM-DD）。
 * サーバーでの事前レンダリング中は ""（日付はブラウザで表示するときに決める）
 */
export function useToday(): string {
  return useSyncExternalStore(subscribe, todayJst, () => "");
}
