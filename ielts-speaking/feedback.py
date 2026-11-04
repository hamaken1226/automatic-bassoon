"""OpenAI への文字起こし・評価の依頼。"""

import json
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# モデル名・料金は .env で変えられる(料金は 2026年時点の目安。変わったら .env で上書き)
EVAL_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "whisper-1")
PRICE_INPUT_PER_1M = float(os.getenv("PRICE_INPUT_PER_1M_USD", "0.15"))
PRICE_OUTPUT_PER_1M = float(os.getenv("PRICE_OUTPUT_PER_1M_USD", "0.60"))
PRICE_WHISPER_PER_MIN = float(os.getenv("PRICE_WHISPER_PER_MIN_USD", "0.006"))
JPY_PER_USD = float(os.getenv("JPY_PER_USD", "150"))

# フィラーを消されないよう、フィラー入りの文を prompt に渡す
WHISPER_PROMPT = "Umm, let me think, like, hmm... Well, uh, I mean, it's, you know, sort of... Er, ah, so basically, uh, maybe."

_client = None


def client() -> OpenAI:
    global _client
    if _client is None:
        if not os.getenv("OPENAI_API_KEY"):
            raise RuntimeError(".env に OPENAI_API_KEY が設定されていません")
        _client = OpenAI(max_retries=3, timeout=120)
    return _client


def transcribe(audio_bytes: bytes, filename: str = "answer.webm") -> dict:
    """Whisper で単語タイムスタンプつきの文字起こしを取る。"""
    res = client().audio.transcriptions.create(
        model=TRANSCRIBE_MODEL,
        file=(filename, audio_bytes, "audio/webm"),
        response_format="verbose_json",
        timestamp_granularities=["word"],
        language="en",  # 日本語・韓国語への誤判定を防ぐ
        prompt=WHISPER_PROMPT,
        temperature=0,
    )
    data = res.model_dump() if hasattr(res, "model_dump") else dict(res)
    return {
        "text": (data.get("text") or "").strip(),
        "words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in (data.get("words") or [])],
        "audio_duration_sec": data.get("duration") or 0,
    }


# ---------------------------------------------------------------- 評価

ERROR_CATEGORIES = ["collocation", "article", "preposition", "tense", "word_usage",
                    "agreement", "word_order", "plural", "other"]

EVAL_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["band_estimate", "structure", "errors", "paraphrases", "model_answer", "next_focus"],
    "properties": {
        "band_estimate": {
            "type": "object",
            "additionalProperties": False,
            "required": ["fluency_coherence", "lexical_resource", "grammar", "comment"],
            "properties": {
                "fluency_coherence": {"type": "number"},
                "lexical_resource": {"type": "number"},
                "grammar": {"type": "number"},
                "comment": {"type": "string"},
            },
        },
        "structure": {
            "type": "object",
            "additionalProperties": False,
            "required": ["covered_points", "missing_points", "has_conclusion", "comment"],
            "properties": {
                "covered_points": {"type": "array", "items": {"type": "string"}},
                "missing_points": {"type": "array", "items": {"type": "string"}},
                "has_conclusion": {"type": "boolean"},
                "comment": {"type": "string"},
            },
        },
        "errors": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["original", "correction", "reason", "category"],
                "properties": {
                    "original": {"type": "string"},
                    "correction": {"type": "string"},
                    "reason": {"type": "string"},
                    "category": {"type": "string", "enum": ERROR_CATEGORIES},
                },
            },
        },
        "paraphrases": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["word", "alternatives"],
                "properties": {
                    "word": {"type": "string"},
                    "alternatives": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "model_answer": {"type": "string"},
        "next_focus": {"type": "string"},
    },
}

SYSTEM_PROMPT = """You are an experienced IELTS Speaking examiner and coach giving feedback to a Japanese learner
(current level around CEFR B2, target IELTS Band 7) preparing for the General Training test.
The learner especially wants to fix: (1) overuse of fillers, (2) repeating the same content words,
(3) weak or trailing-off conclusions. Grammatical range is a strength to maintain.

## IELTS Speaking band descriptors (summary)
Fluency & Coherence (FC):
- 5: relies on repetition/self-correction/slow speech to keep going; overuses some connectives; simple speech fluent, complex topics cause problems.
- 6: willing to speak at length but may lose coherence due to repetition, self-correction or hesitation; uses a range of connectives, not always appropriately.
- 7: speaks at length without noticeable effort or loss of coherence; some language-related hesitation/repetition/self-correction; uses a range of connectives and discourse markers flexibly.
- 8: speaks fluently with only occasional repetition or self-correction; hesitation is usually content-related; develops topics coherently and appropriately.
Lexical Resource (LR):
- 5: manages familiar and unfamiliar topics but limited flexibility; attempts paraphrase with mixed success.
- 6: wide enough vocabulary to discuss topics at length; generally paraphrases successfully.
- 7: uses vocabulary flexibly; some less common and idiomatic items, awareness of style and collocation, some inappropriate choices; paraphrases effectively.
- 8: wide resource used readily and flexibly; skilful use of less common and idiomatic vocabulary, occasional inaccuracies.
Grammatical Range & Accuracy (GRA):
- 5: basic sentence forms with reasonable accuracy; limited complex structures with errors.
- 6: mix of simple and complex structures, limited flexibility; frequent mistakes with complex structures that rarely impede communication.
- 7: range of complex structures with some flexibility; frequently error-free sentences; a few errors persist.
- 8: wide range of structures flexibly used; majority of sentences error-free; occasional non-systematic errors.

## Rules
- The transcript comes from automatic speech recognition. Do NOT judge pronunciation. Treat obvious recognition glitches charitably.
- All counts (fillers, repeated words, pauses, speed) were computed by a program and are given to you. Do NOT recount them; use them as evidence.
- band_estimate: use 0.5 steps (e.g. 6.0, 6.5). In "comment" (Japanese), say briefly why, and that this is only a rough estimate from one short transcript.
- structure (comments in Japanese, points may quote English):
  - Part 1: covered_points = what the answer did (direct answer, reason, example/detail). missing_points = what would extend it. has_conclusion = whether the answer ends clearly rather than trailing off.
  - Part 2: covered_points / missing_points = the cue-card points (quote each point). has_conclusion = whether the talk is wrapped up with a clear closing sentence. Mention whether the speaker used the full time.
  - Part 3: check the pattern Answer -> Reason -> Example -> Summary. covered_points / missing_points = those four elements (write them in Japanese, e.g. "答え", "理由", "例", "まとめ").
- errors: only clear, real errors (max 8, most important first). "original" must quote the learner's words exactly from the transcript; "correction" is the minimal fix in English; "reason" in Japanese; do not list fillers as errors. If there are no errors, return [].
- paraphrases: for EACH repeated word given, give 3-4 natural alternatives in English that fit THIS answer's context (words or short phrases). If no repeated words are given, return [].
- model_answer: rewrite the learner's own answer (keep their ideas, experiences and opinions) as a natural spoken Band 7-7.5 answer. Use vocabulary a B2+ learner can realistically use - NOT Band 9 showy vocabulary. No fillers. Length: Part 1 about 50-70 words, Part 2 about 230-270 words with a clear closing sentence, Part 3 about 90-120 words following Answer -> Reason -> Example -> Summary.
- next_focus: exactly ONE concrete thing to focus on next time, in Japanese, 1-2 sentences, actionable in the next practice.
- Write all explanations/comments in Japanese. Keep quotes, corrections, alternatives and the model answer in English."""


def _user_prompt(part: int, question: dict, transcript: str, metrics: dict) -> str:
    q_lines = [f"Part: {part}", f"Question: {question.get('question')}"]
    if question.get("points"):
        q_lines.append("Cue card points:\n" + "\n".join(f"- {p}" for p in question["points"]))
    m = metrics
    fill = ", ".join(f"{k} x{v}" for k, v in m["fillers"]["by_type"].items()) or "none"
    check = ", ".join(f"{k} x{v}" for k, v in m["fillers"]["check_by_type"].items()) or "none"
    rep = ", ".join(f"{r['word']} x{r['count']}" for r in m["repeated"]) or "none"
    stats = (
        f"Speaking time: {m['duration_sec']} s\n"
        f"Words: {m['word_count']}, speed: {m['wpm']} words per minute\n"
        f"Pauses of {m['pauses']['threshold_sec']}s or longer: {m['pauses']['count']} (longest {m['pauses']['longest_sec']} s)\n"
        f"Fillers: {fill}\n"
        f"Possible fillers (may be normal usage): {check}\n"
        f"Repeated content words (3+ times): {rep}\n"
        f"Lexical diversity (type/token): {m['lexical_diversity']}"
    )
    if part == 2:
        stats += f"\nSpoke for 1m45s or more: {'yes' if m['part2_complete'] else 'no'}"
    return "\n".join(q_lines) + "\n\n## Program-computed metrics\n" + stats + "\n\n## Transcript\n" + transcript


def evaluate(part: int, question: dict, transcript: str, metrics: dict) -> tuple[dict, dict]:
    """AI評価を返す。戻り値: (評価JSON, usage)"""
    res = client().chat.completions.create(
        model=EVAL_MODEL,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(part, question, transcript, metrics)},
        ],
        response_format={"type": "json_schema",
                         "json_schema": {"name": "ielts_feedback", "strict": True, "schema": EVAL_SCHEMA}},
    )
    msg = res.choices[0].message
    if getattr(msg, "refusal", None):
        raise RuntimeError(f"AIが評価を拒否しました: {msg.refusal}")
    usage = {"model": EVAL_MODEL,
             "prompt_tokens": res.usage.prompt_tokens if res.usage else 0,
             "completion_tokens": res.usage.completion_tokens if res.usage else 0}
    return json.loads(msg.content), usage


def estimate_cost(audio_seconds: float, usage: dict | None) -> dict:
    usd = audio_seconds / 60 * PRICE_WHISPER_PER_MIN
    if usage:
        usd += usage.get("prompt_tokens", 0) / 1e6 * PRICE_INPUT_PER_1M
        usd += usage.get("completion_tokens", 0) / 1e6 * PRICE_OUTPUT_PER_1M
    return {"usd": round(usd, 5), "jpy": round(usd * JPY_PER_USD, 2)}

