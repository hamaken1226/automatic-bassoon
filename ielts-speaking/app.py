"""IELTS Speaking 練習ツール(FastAPI本体)

起動: python app.py  →  http://localhost:8000
"""

import json
import os
import random
import re
from datetime import datetime

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

import feedback
from metrics import build_transcript_view, compute_metrics

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SESSIONS_DIR = os.path.join(BASE_DIR, "data", "sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)

SID_RE = re.compile(r"^\d{8}-\d{6}_part[123]$")

with open(os.path.join(BASE_DIR, "questions.json"), encoding="utf-8") as f:
    _q = json.load(f)
CARDS = {c["id"]: c for c in _q["part2"]}
QUESTIONS = {
    1: [{**q, "part": 1} for q in _q["part1"]],
    2: [{**c, "part": 2} for c in _q["part2"]],
    3: [{**q, "part": 3, "topic": CARDS[q["card"]]["topic"]} for q in _q["part3"]],
}
QUESTION_BY_ID = {q["id"]: q for qs in QUESTIONS.values() for q in qs}

app = FastAPI(title="IELTS Speaking Practice")


# ---------------------------------------------------------------- 保存まわり

def _path(sid: str, ext: str) -> str:
    if not SID_RE.match(sid):
        raise HTTPException(404, "not found")
    return os.path.join(SESSIONS_DIR, f"{sid}.{ext}")


def _save(record: dict) -> None:
    with open(_path(record["id"], "json"), "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)


def _load(sid: str) -> dict:
    p = _path(sid, "json")
    if not os.path.exists(p):
        raise HTTPException(404, "not found")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def _all_sessions() -> list[dict]:
    """保存済みのセッションを新しい順に返す。"""
    out = []
    for name in sorted(os.listdir(SESSIONS_DIR), reverse=True):
        if name.endswith(".json") and SID_RE.match(name[:-5]):
            try:
                out.append(_load(name[:-5]))
            except (OSError, json.JSONDecodeError):
                continue
    return out


def _previous(record: dict) -> dict | None:
    """同じPartの、ひとつ前の(指標が出ている)練習。"""
    for r in _all_sessions():
        if r["part"] == record["part"] and r["id"] < record["id"] and r.get("metrics"):
            return {"id": r["id"], "created_at": r["created_at"], "metrics": r["metrics"]}
    return None


def _with_previous(record: dict) -> dict:
    return {**record, "previous": _previous(record)}


# ---------------------------------------------------------------- エンドポイント

@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/question")
def get_question(part: int, exclude: str | None = None):
    if part not in QUESTIONS:
        raise HTTPException(400, "part must be 1, 2 or 3")
    pool = [q for q in QUESTIONS[part] if q["id"] != exclude] or QUESTIONS[part]
    return random.choice(pool)


@app.post("/api/evaluate")
def evaluate(audio: UploadFile = File(...), part: int = Form(...), question_id: str = Form(...)):
    question = QUESTION_BY_ID.get(question_id)
    if part not in QUESTIONS or not question or question["part"] != part:
        raise HTTPException(400, "part / question_id が不正です")
    audio_bytes = audio.file.read()
    if len(audio_bytes) < 2000:
        raise HTTPException(400, "録音が短すぎます")

    now = datetime.now()
    sid = f"{now:%Y%m%d-%H%M%S}_part{part}"
    with open(_path(sid, "webm"), "wb") as f:
        f.write(audio_bytes)

    record = {
        "id": sid,
        "created_at": now.isoformat(timespec="seconds"),
        "part": part,
        "question": question,
        "transcript": None,
        "transcript_view": None,
        "words": None,
        "metrics": None,
        "feedback": None,
        "feedback_error": None,
        "usage": None,
        "cost": None,
    }

    # 1) 文字起こし
    try:
        tr = feedback.transcribe(audio_bytes)
    except Exception as e:
        record["feedback_error"] = f"文字起こしに失敗しました: {e}"
        _save(record)
        raise HTTPException(502, record["feedback_error"])
    record["transcript"], record["words"] = tr["text"], tr["words"]
    audio_sec = tr["audio_duration_sec"]
    if not tr["words"]:
        record["feedback_error"] = "音声から英語が聞き取れませんでした。マイクを確認してください。"
        record["cost"] = feedback.estimate_cost(audio_sec, None)
        _save(record)
        raise HTTPException(422, record["feedback_error"])

    # 2) Pythonで指標を計算
    m = compute_metrics(tr["words"], part)
    record["transcript_view"] = build_transcript_view(tr["text"], tr["words"], m.pop("word_kinds"), m.pop("pause_before"))
    record["metrics"] = m

    # 3) AIで評価(失敗しても数字と文字起こしは返す)
    usage = None
    try:
        record["feedback"], usage = feedback.evaluate(part, question, tr["text"], m)
    except Exception as e:
        record["feedback_error"] = f"AIの評価に失敗しました(数字と文字起こしは有効です): {e}"
    record["usage"] = {"audio_sec": round(audio_sec, 1), **(usage or {})}
    record["cost"] = feedback.estimate_cost(audio_sec, usage)

    _save(record)
    return _with_previous(record)


@app.get("/api/history")
def history():
    rows = []
    for r in _all_sessions():
        m, fb = r.get("metrics") or {}, r.get("feedback") or {}
        rows.append({
            "id": r["id"],
            "created_at": r["created_at"],
            "part": r["part"],
            "question": r["question"].get("question"),
            "duration_sec": m.get("duration_sec"),
            "wpm": m.get("wpm"),
            "fillers": (m.get("fillers") or {}).get("total"),
            "fillers_check": (m.get("fillers") or {}).get("check_total"),
            "pauses": (m.get("pauses") or {}).get("count"),
            "longest_pause": (m.get("pauses") or {}).get("longest_sec"),
            "lexical_diversity": m.get("lexical_diversity"),
            "repeated": len(m.get("repeated") or []),
            "band": fb.get("band_estimate"),
            "next_focus": fb.get("next_focus"),
            "cost_jpy": (r.get("cost") or {}).get("jpy"),
            "ok": bool(m),
        })
    return rows


@app.get("/api/session/{sid}")
def get_session(sid: str):
    return _with_previous(_load(sid))


@app.get("/api/audio/{sid}")
def get_audio(sid: str):
    p = _path(sid, "webm")
    if not os.path.exists(p):
        raise HTTPException(404, "not found")
    return FileResponse(p, media_type="audio/webm")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
