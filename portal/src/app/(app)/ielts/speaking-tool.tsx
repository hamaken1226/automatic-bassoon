"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { secondaryButton } from "@/components/ui/styles";

export const SPEAKING_TOOL_URL = "http://localhost:8000";

const DESKTOP_QUERY = "(min-width: 768px)";

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * PCのみ: ローカルで動く Speaking 練習ツールを埋め込む（マイクの使用を許可）。
 * 起動していない・ブラウザの制限で読み込めないときは案内と「別タブで開く」を出す。
 */
export function SpeakingTool() {
  const desktop = useIsDesktop();
  const [status, setStatus] = useState<"checking" | "up" | "down">("checking");

  const check = useCallback(async () => {
    setStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      // 応答の中身は読めない（no-cors）が、届けば起動している
      await fetch(SPEAKING_TOOL_URL, { mode: "no-cors", signal: controller.signal, cache: "no-store" });
      setStatus("up");
    } catch {
      setStatus("down");
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (desktop) Promise.resolve().then(check);
  }, [desktop, check]);

  if (!desktop) return null;

  const openButton = (
    <a href={SPEAKING_TOOL_URL} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} inline-flex items-center gap-1.5`}>
      <ExternalLink className="size-4" aria-hidden />
      別タブで開く
    </a>
  );

  return (
    <section aria-label="Speaking練習ツール" className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Speaking 練習ツール</h2>
        <div className="flex gap-2">
          <button type="button" onClick={check} className={`${secondaryButton} inline-flex items-center gap-1.5`}>
            <RefreshCw className="size-4" aria-hidden />
            再確認
          </button>
          {openButton}
        </div>
      </div>
      {status === "checking" ? (
        <p className="text-sm text-muted">確認中…</p>
      ) : status === "down" ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm">
          <p className="font-semibold">ツールが起動していません</p>
          <p className="mt-1 text-muted">
            PCでツールを起動してから「再確認」を押してください。ブラウザの制限で埋め込めない場合は「別タブで開く」を使ってください。
          </p>
        </div>
      ) : (
        <iframe
          src={SPEAKING_TOOL_URL}
          title="IELTS Speaking 練習ツール"
          allow="microphone; autoplay"
          className="h-[640px] w-full rounded-lg border border-border bg-white"
        />
      )}
    </section>
  );
}
