"use client";

import { useEffect, useState } from "react";
import { inputClass, labelClass, primaryButton } from "@/components/ui/styles";
import { DEFAULT_PROMPTS, DEFAULT_TARGETS, formatBand, SKILL_LABEL, SKILLS, type Targets } from "@/lib/ielts";
import { getSupabase } from "@/lib/supabase/client";
import { loadSetting, PROMPTS_KEY, saveSetting, TARGETS_KEY, type Prompts } from "@/lib/use-ielts";
import { ErrorNote } from "../study/shared";

const sectionClass = "rounded-xl border border-border bg-card p-4";
const BANDS = Array.from({ length: 19 }, (_, i) => i * 0.5);
const PROMPT_SKILLS = ["reading", "listening", "writing"] as const;

/** IELTSの設定: 目標バンドと Claude 用の指示文 */
export function IeltsSettings() {
  const sb = getSupabase();
  const [targets, setTargets] = useState<Targets | null>(null);
  const [prompts, setPrompts] = useState<Prompts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadSetting(sb, TARGETS_KEY, DEFAULT_TARGETS), loadSetting(sb, PROMPTS_KEY, DEFAULT_PROMPTS)])
      .then(([t, p]) => {
        setTargets(t);
        setPrompts(p);
      })
      .catch((e: Error) => setError(e.message));
  }, [sb]);

  if (!targets || !prompts) return error ? <ErrorNote error={error} /> : <p className="text-sm text-muted">読み込み中…</p>;

  const updateTarget = async (key: keyof Targets, value: number) => {
    const next = { ...targets, [key]: value };
    setTargets(next);
    try {
      await saveSetting(sb, TARGETS_KEY, next);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const savePrompts = async () => {
    try {
      await saveSetting(sb, PROMPTS_KEY, prompts);
      setError(null);
      setSaved("指示文を保存しました");
      setTimeout(() => setSaved(null), 2500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorNote error={error} />
      <section aria-label="目標バンド" className={sectionClass}>
        <h3 className="mb-3 font-semibold">目標バンド</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["overall", ...SKILLS] as const).map((key) => (
            <label key={key} className="block">
              <span className={labelClass}>{key === "overall" ? "Overall" : SKILL_LABEL[key]}</span>
              <select value={targets[key]} onChange={(e) => updateTarget(key, Number(e.target.value))} className={inputClass}>
                {BANDS.map((b) => (
                  <option key={b} value={b}>
                    {formatBand(b)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section aria-label="Claude用の指示文" className={sectionClass}>
        <h3 className="font-semibold">Claude用の指示文</h3>
        <p className="mb-3 text-xs text-muted">
          IELTSの画面の「Claude用の指示文をコピー」でコピーされる文です。最後の [IELTS-RESULT] の形式（キー名）を変えると自動入力できなくなります。
        </p>
        <div className="space-y-4">
          {PROMPT_SKILLS.map((s) => (
            <div key={s}>
              <div className="mb-1 flex items-center justify-between">
                <span className={labelClass}>{SKILL_LABEL[s]}</span>
                <button type="button" onClick={() => setPrompts({ ...prompts, [s]: DEFAULT_PROMPTS[s] })} className="text-xs text-accent underline">
                  初期の文に戻す
                </button>
              </div>
              <textarea
                aria-label={`${SKILL_LABEL[s]}の指示文`}
                value={prompts[s]}
                onChange={(e) => setPrompts({ ...prompts, [s]: e.target.value })}
                className={`${inputClass} [field-sizing:content] min-h-40 font-mono text-sm`}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          {saved && (
            <span role="status" className="text-sm text-accent">
              {saved}
            </span>
          )}
          <button type="button" onClick={savePrompts} className={primaryButton}>
            指示文を保存
          </button>
        </div>
      </section>
    </div>
  );
}

