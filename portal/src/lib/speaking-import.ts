import { speakingBand } from "./ielts";
import type { IeltsDetails } from "./types";

/** Speaking練習ツールが保存する data/sessions/〇〇.json から取り込む項目 */
export type SpeakingImport = {
  date: string;
  source: string;
  band: number | null;
  notes: string;
  details: IeltsDetails;
  import_filename: string;
};

type Session = {
  created_at?: string;
  part?: number | string;
  question?: { question?: string; topic?: string } | string;
  metrics?: {
    wpm?: number;
    fillers?: { total?: number };
    pauses?: { count?: number };
  };
  feedback?: {
    band_estimate?: {
      fluency_coherence?: number;
      lexical_resource?: number;
      grammar?: number;
      comment?: string;
    };
    next_focus?: string;
  } | null;
};

const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * ツールのJSONを読み、IELTSの記録の形にする。形式が違えば例外。
 * created_at はタイムゾーンなしの日本時間（例: 2026-11-04T16:52:52）として扱う。
 */
export function parseSpeakingSession(text: string, filename: string): SpeakingImport {
  let s: Session;
  try {
    s = JSON.parse(text) as Session;
  } catch {
    throw new Error("JSONとして読めません");
  }
  if (!s || typeof s !== "object" || !s.created_at || !s.metrics) {
    throw new Error("Speaking練習ツールのファイルではないようです");
  }
  const date = String(s.created_at).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日時（created_at）が読めません");

  const q = typeof s.question === "string" ? { question: s.question } : (s.question ?? {});
  const band = s.feedback?.band_estimate ?? {};
  const fluency = numOrNull(band.fluency_coherence);
  const lexical = numOrNull(band.lexical_resource);
  const grammar = numOrNull(band.grammar);

  return {
    date,
    source: q.topic ? `練習ツール（${q.topic}）` : "練習ツール",
    band: speakingBand([fluency, lexical, grammar]),
    notes: [band.comment, s.feedback?.next_focus].filter(Boolean).join("\n"),
    details: {
      part: s.part != null ? String(s.part) : "",
      question: q.question ?? "",
      fluency,
      speaking_lexical: lexical,
      speaking_grammar: grammar,
      // Pronunciationはツールでは評価しないので空欄（あとから手入力できる）
      pronunciation: null,
      wpm: numOrNull(s.metrics.wpm),
      fillers: numOrNull(s.metrics.fillers?.total),
      pauses: numOrNull(s.metrics.pauses?.count),
      recorded_at: String(s.created_at),
    },
    import_filename: filename,
  };
}
