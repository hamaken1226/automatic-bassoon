"""数えられるものはPythonで数える。AIには数えさせない。

入力は Whisper(verbose_json, word timestamps)の words:
    [{"word": "Well", "start": 0.0, "end": 0.32}, ...]
"""

import re
from collections import Counter, defaultdict

from wordlists import FILLER_VARIANTS, FILLERS, FILLERS_TO_CHECK, STOPWORDS

PAUSE_THRESHOLD_SEC = 1.0
PART2_COMPLETE_SEC = 105  # 1分45秒
REPEAT_MIN_COUNT = 3

WORD_RE = re.compile(r"[^\W_][\w'\u2019\-]*")  # café などアクセント付きも1語として扱う


def normalize(word: str) -> str:
    w = word.lower().replace("’", "'")
    w = re.sub(r"[^\w'\-]", "", w).replace("_", "").strip("'-")
    return FILLER_VARIANTS.get(w, w)


def lemma(w: str) -> str:
    """繰り返し語をまとめるためのごく簡単な語形の統一(customers → customer など)。"""
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is", "'s")):
        return w[:-1]
    return w


def _match_phrases(tokens, phrases):
    """tokens 上で phrases(複数語可)を長い順に探す。

    返り値: ({token_index: phrase}, Counter(phrase -> 回数))
    """
    seqs = sorted(((p, p.split()) for p in phrases), key=lambda x: -len(x[1]))
    hit, counts = {}, Counter()
    i = 0
    while i < len(tokens):
        for phrase, seq in seqs:
            if tokens[i:i + len(seq)] == seq:
                for k in range(i, i + len(seq)):
                    hit[k] = phrase
                counts[phrase] += 1
                i += len(seq)
                break
        else:
            i += 1
    return hit, counts


def compute_metrics(words, part: int) -> dict:
    tokens = [normalize(w.get("word", "")) for w in words]
    idx = [i for i, t in enumerate(tokens) if t]  # 空でない単語の位置

    if not idx:
        return {"word_count": 0, "duration_sec": 0, "wpm": 0,
                "pauses": {"count": 0, "longest_sec": 0, "threshold_sec": PAUSE_THRESHOLD_SEC, "items": []},
                "fillers": {"total": 0, "by_type": {}, "check_total": 0, "check_by_type": {}},
                "repeated": [], "unique_words": 0, "lexical_diversity": 0,
                "part2_complete": (False if part == 2 else None),
                "word_kinds": [None] * len(words), "pause_before": [None] * len(words)}

    clean = [tokens[i] for i in idx]

    # 話した時間・語数・WPM
    start = float(words[idx[0]]["start"])
    end = float(words[idx[-1]]["end"])
    duration = max(end - start, 0.0)
    word_count = len(idx)
    wpm = word_count / (duration / 60) if duration > 0 else 0

    # 沈黙(単語と単語の間が閾値以上)
    pauses = []
    pause_before = [None] * len(words)
    for a, b in zip(idx, idx[1:]):
        gap = float(words[b]["start"]) - float(words[a]["end"])
        if gap >= PAUSE_THRESHOLD_SEC:
            pauses.append({"after": words[a]["word"], "before": words[b]["word"],
                           "at_sec": round(float(words[a]["end"]) - start, 1), "sec": round(gap, 1)})
            pause_before[b] = round(gap, 1)

    # フィラー(確実なもの / 要確認)
    filler_hit, filler_counts = _match_phrases(clean, FILLERS)
    check_hit = {k: t for k, t in enumerate(clean) if k not in filler_hit and t in FILLERS_TO_CHECK}
    check_counts = Counter(check_hit.values())

    # 繰り返し語(内容語のみ)
    groups = defaultdict(list)  # lemma -> [(clean_index, surface)]
    for k, t in enumerate(clean):
        if k in filler_hit or k in check_hit or t in STOPWORDS or t.isdigit() or len(t) < 2:
            continue
        groups[lemma(t)].append((k, t))
    repeated = []
    repeat_idx = set()
    for lem, occ in groups.items():
        if len(occ) >= REPEAT_MIN_COUNT:
            forms = Counter(t for _, t in occ)
            repeated.append({"word": forms.most_common(1)[0][0], "count": len(occ),
                             "forms": sorted(forms)})
            repeat_idx.update(k for k, _ in occ)
    repeated.sort(key=lambda r: (-r["count"], r["word"]))

    # 文字起こしの色付け用に、元の words と同じ長さの種別リストを作る
    word_kinds = [None] * len(words)
    for k, i in enumerate(idx):
        if k in filler_hit:
            word_kinds[i] = "filler"
        elif k in check_hit:
            word_kinds[i] = "check"
        elif k in repeat_idx:
            word_kinds[i] = "repeat"

    unique = len(set(clean))
    return {
        "duration_sec": round(duration, 1),
        "word_count": word_count,
        "wpm": round(wpm, 1),
        "pauses": {
            "count": len(pauses),
            "longest_sec": max((p["sec"] for p in pauses), default=0),
            "threshold_sec": PAUSE_THRESHOLD_SEC,
            "items": pauses,
        },
        "fillers": {
            "total": sum(filler_counts.values()),
            "by_type": dict(filler_counts.most_common()),
            "check_total": sum(check_counts.values()),
            "check_by_type": dict(check_counts.most_common()),
        },
        "repeated": repeated,
        "unique_words": unique,
        "lexical_diversity": round(unique / word_count, 2),
        "part2_complete": (duration >= PART2_COMPLETE_SEC) if part == 2 else None,
        "word_kinds": word_kinds,
        "pause_before": pause_before,
    }


def build_transcript_view(text: str, words, word_kinds, pause_before):
    """句読点つきの全文に、単語ごとの種別(filler/check/repeat)と直前の沈黙を対応づける。

    Whisper の text と words は通常同じ順序なので、先頭から順に照合する
    (ずれた場合は数語先まで探して追いつく)。
    """
    if not text.strip():
        text = " ".join(w.get("word", "") for w in words)
    norm_words = [normalize(w.get("word", "")) for w in words]
    segs, pos, j = [], 0, 0
    for m in WORD_RE.finditer(text):
        if m.start() > pos:
            segs.append({"text": text[pos:m.start()]})
        seg = {"text": m.group()}
        target = normalize(m.group())
        for k in range(j, min(j + 4, len(words))):
            if norm_words[k] == target:
                if word_kinds[k]:
                    seg["kind"] = word_kinds[k]
                if pause_before[k]:
                    seg["pause"] = pause_before[k]
                j = k + 1
                break
        segs.append(seg)
        pos = m.end()
    if pos < len(text):
        segs.append({"text": text[pos:]})
    return segs
