import { BELOW_TABLE_BAND, LISTENING_BANDS, READING_GT_BANDS } from "./ielts-bands";

export const SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABEL: Record<Skill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

/** 目標バンドの初期値 */
export const DEFAULT_TARGETS: Record<Skill | "overall", number> = {
  overall: 7.5,
  listening: 8,
  reading: 8,
  writing: 7,
  speaking: 7,
};

export type Targets = typeof DEFAULT_TARGETS;

/** 正答数 → バンドの目安。問題数が40でなければ40問に換算してから表を引く */
export function rawToBand(skill: "listening" | "reading", correct: number, total = 40): number | null {
  if (!(total > 0) || correct < 0 || correct > total) return null;
  const scaled = Math.round((correct * 40) / total);
  const table = skill === "listening" ? LISTENING_BANDS : READING_GT_BANDS;
  for (const [min, band] of table) if (scaled >= min) return band;
  return BELOW_TABLE_BAND;
}

/** IELTSの端数処理: 平均の端数が .25 なら .5 に、.75 なら次の整数に切り上げる */
export function roundBand(average: number): number {
  const whole = Math.floor(average);
  const frac = Math.round((average - whole) * 1000) / 1000;
  if (frac < 0.25) return whole;
  if (frac < 0.75) return whole + 0.5;
  return whole + 1;
}

/** 4技能のバンドからオーバーオールの目安。1つでも欠けていれば null */
export function overallBand(bands: Partial<Record<Skill, number | null>>): number | null {
  const values = SKILLS.map((s) => bands[s]);
  if (values.some((v) => v == null)) return null;
  return roundBand((values as number[]).reduce((a, b) => a + b, 0) / 4);
}

/** Speaking: 入力されている観点の平均 */
export function speakingBand(criteria: (number | null | undefined)[]): number | null {
  const present = criteria.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (present.length === 0) return null;
  return roundBand(present.reduce((a, b) => a + b, 0) / present.length);
}

/** バンドの表示（6 → "6.0"） */
export function formatBand(band: number | null | undefined): string {
  return band == null ? "—" : band.toFixed(1);
}

// ---- Claudeの返答の読み取り ----

/**
 * 返答の中の [IELTS-RESULT] ブロックを読み、「キー: 値」を返す。
 * 「feedback: |」のあとの字下げされた行は複数行の値としてまとめる。見つからなければ null。
 */
export function parseIeltsResult(text: string): Record<string, string> | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim().replace(/^`+/, "") === "[IELTS-RESULT]");
  if (start === -1) return null;
  const result: Record<string, string> = {};
  let multiKey: string | null = null;
  let multi: string[] = [];
  const flush = () => {
    if (multiKey) {
      // 共通の字下げを取り除く
      const indent = Math.min(...multi.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length), Infinity);
      result[multiKey] = multi
        .map((l) => l.slice(Number.isFinite(indent) ? indent : 0))
        .join("\n")
        .trim();
      multiKey = null;
      multi = [];
    }
  };
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("```") || line.trim() === "[/IELTS-RESULT]") break;
    if (multiKey) {
      if (line.trim() === "" || /^\s/.test(line)) {
        multi.push(line);
        continue;
      }
      flush();
    }
    const m = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.*)$/);
    if (!m) {
      if (line.trim() === "" && Object.keys(result).length > 0) continue;
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (value === "|" || value === "|-" || value === ">") {
      multiKey = key;
      multi = [];
    } else {
      result[key] = value;
    }
  }
  flush();
  return Object.keys(result).length > 0 ? result : null;
}

/** 数値として読む（"6.5" → 6.5、読めなければ null） */
export function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value.replace(/[^\d.\-]/g, ""));
  return value.trim() !== "" && Number.isFinite(n) ? n : null;
}

// ---- Claude用の指示文（設定画面で編集できる） ----

const COMMON = `最後に、次の形式のブロックを必ずそのまま出力してください（キー名は変えないでください）。`;

export const DEFAULT_PROMPTS: Record<"reading" | "listening" | "writing", string> = {
  reading: `IELTS General Training の Reading の練習をしました。下に問題と私の解答を貼ります。
採点して、間違えた問題の解説と、全体の難易度（IELTSのバンドで言うとどのくらいの問題か）を教えてください。
${COMMON}

[IELTS-RESULT]
skill: Reading
difficulty: （問題の難易度をバンドで。例: 6.5）
correct: （正答数）
total: （問題数）
comment: （一言の振り返り）

--- 問題と解答 ---
`,
  listening: `IELTS の Listening の練習をしました。下に問題・スクリプトと私の解答を貼ります。
採点して、間違えた問題の解説と、全体の難易度（IELTSのバンドで言うとどのくらいの問題か）を教えてください。
${COMMON}

[IELTS-RESULT]
skill: Listening
difficulty: （問題の難易度をバンドで。例: 6.5）
correct: （正答数）
total: （問題数）
comment: （一言の振り返り）

--- 問題と解答 ---
`,
  writing: `IELTS General Training の Writing の練習をしました。下にお題と私の解答を貼ります。
IELTSの公式の採点基準に沿って採点し、各観点のバンドと、改善点を具体的に教えてください。
${COMMON}
（Task 1 のときは task_response の欄に Task Achievement のバンドを入れてください）

[IELTS-RESULT]
skill: Writing
task: （1 または 2）
overall: （総合バンド）
task_response: （Task Achievement / Task Response のバンド）
coherence_cohesion: （バンド）
lexical_resource: （バンド）
grammar: （Grammatical Range and Accuracy のバンド）
feedback: |
  （フィードバック本文。複数行可。各行の先頭に半角スペース2つ）

--- お題と解答 ---
`,
};
