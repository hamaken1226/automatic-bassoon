#!/usr/bin/env python3
"""
stability.py — 採点のぶれ（再現性）を検証する再実験スクリプト。

同じ書き起こしテキストを、条件を変えながら GPT-4o で N 回ずつ採点し、
エラー率・必須文脈数・化石化判定が実行ごとにどれだけ揺れるかを集計する。
書き起こしは固定して使う（Whisper を毎回かけ直さない）ので、測っているのは純粋に採点（LLM）側のぶれ。

使い方:
  0. 手動文字起こし用に音声をダウンロードする（ファイル名にセット名が付くので、transcripts.csv と対応づけやすい）
       python experiments/stability.py download --users KentaH
     → experiments/audio/KentaH_SetA_Q01.wav ...

  1. 書き起こしをスプレッドシートから CSV に書き出す（manual_transcript 列は空で出力される）
       python experiments/stability.py export
     → experiments/transcripts.csv ができる。音声を聞きながら manual_transcript 列を埋めれば手動文字起こし版になる。

  1.5 抜けている問題を、GCS の音声から Whisper で文字起こしし直して埋める
       python experiments/stability.py transcribe --dry-run   # 対象と音声の有無を確認
       python experiments/stability.py transcribe

  2. 採点を繰り返す（結果は experiments/results/runs.jsonl に追記。途中で止めても続きから再開できる）
       python experiments/stability.py run --users KentaH --runs 5
       python experiments/stability.py run --text manual --users KentaH --runs 5

  3. 集計する
       python experiments/stability.py summarize

条件（--conditions で選択。プロンプトの中身は prompts.py を参照）:
  メインの比較（既定ではこの4つを実行）
    baseline      現状の app.py と同じプロンプト（temperature=0、10問まとめて1回で採点）
    a_rubric      プロンプトA「定義の明文化」: 何を1件と数えるかを観点ごとに厳密に定義
    b_clause      プロンプトB「手順の固定」: 節に分け、節ごとに決まった4つの質問に順番に答えさせる
    c_fewshot     プロンプトC「採点例の提示」: 定義は最小限にし、採点済みの例を2つ見せる
  補助の分析用（改善のうち、どこまでが乱数の固定・出力形式・一度に処理する量の効果かを切り分ける）
    seed          baseline + seed を固定
    schema        A/C と同じ出力形式で、定義も例もない最小限のプロンプト
    a_rubric_perq プロンプトA を1問ずつ別々に採点して合算
  baseline 以外はすべて seed を固定し、フィードバック文は生成させない。

注意: .streamlit/secrets.toml（OPENAI_API_KEY, gcp_service_account）が必要。
      OPENAI_API_KEY は環境変数でもよい。export は --from-csv を付ければ GCP 認証なしで動く。
"""

import argparse
import csv
import io
import json
import statistics
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

try:
    import tomllib
    def load_toml(path):
        with open(path, "rb") as f:
            return tomllib.load(f)
except ImportError:
    import toml
    def load_toml(path):
        return toml.load(path)

ROOT = Path(__file__).resolve().parent.parent
EXP_DIR = Path(__file__).resolve().parent
DEFAULT_TRANSCRIPTS = EXP_DIR / "transcripts.csv"
DEFAULT_RESULTS = EXP_DIR / "results" / "runs.jsonl"

SHEET_NAME = "English_AI_Logs"
BUCKET_NAME = "kentaengspeakingtest202605131619"
SET_ORDER = ["Set A", "Set B", "Set C", "Set D"]
# 分析対象の参加者（P001 = 研究者本人の Set A〜D）。TaiseiW は Set A しか実施していないので含めない。
# KentaH は研究者本人の2回目の Set A なので、既定では含めない（--users で明示すれば使える）
PARTICIPANTS = ["P001", "HarunaK", "HaruhiK", "MakoI"]
# メインの比較（現状 + キーポイントの異なる3つのプロンプト）と、補助の分析用の条件
MAIN_CONDITIONS = ["baseline", "a_rubric", "b_clause", "c_fewshot"]
EXTRA_CONDITIONS = ["seed", "schema", "a_rubric_perq"]
ALL_CONDITIONS = MAIN_CONDITIONS + EXTRA_CONDITIONS
SEED = 42

# --- 問題リスト（app.pyと同一）---
ALL_QUESTIONS = {
    "Set A": [
        {"type": "TRANS", "q": "「私は3年間、ずっと英語を勉強しています。」を英語にしてください。"},
        {"type": "TRANS", "q": "「これは、私が昨日買った本です。」を英語にしてください。"},
        {"type": "FREE", "q": "Please introduce yourself in detail."},
        {"type": "FREE", "q": "What do you enjoy doing in your free time?"},
        {"type": "FREE", "q": "Tell me about what your best friend usually does on weekends."},
        {"type": "FREE", "q": "What did you do last weekend? Please explain in detail."},
        {"type": "FREE", "q": "How long have you lived in your current city or town?"},
        {"type": "FREE", "q": "Describe a person who has influenced your life."},
        {"type": "FREE", "q": "What is your favorite food and why?"},
        {"type": "FREE", "q": "What is something you want to achieve in the next 5 years?"},
    ],
    "Set B": [
        {"type": "TRANS", "q": "「私は小学生の時から、ピアノを習っています。」を英語にしてください。"},
        {"type": "TRANS", "q": "「あの人は、私が公園で会った男性です。」を英語にしてください。"},
        {"type": "FREE", "q": "Please describe your hometown."},
        {"type": "FREE", "q": "What are your favorite ways to relax after studying or working?"},
        {"type": "FREE", "q": "Describe a typical busy day for your mother or father."},
        {"type": "FREE", "q": "Where did you go for your last vacation? What did you do?"},
        {"type": "FREE", "q": "What is a hobby or activity you have been doing for a long time?"},
        {"type": "FREE", "q": "Talk about a movie or book that changed your way of thinking."},
        {"type": "FREE", "q": "Do you prefer living in a city or the countryside? Why?"},
        {"type": "FREE", "q": "If you had a lot of money, what would you like to build or create?"},
    ],
    "Set C": [
        {"type": "TRANS", "q": "「私は5年前から、この町に住んでいます。」を英語にしてください。"},
        {"type": "TRANS", "q": "「これは、母が私に作ってくれたケーキです。」を英語にしてください。"},
        {"type": "FREE", "q": "What are your main interests right now?"},
        {"type": "FREE", "q": "What are the benefits of learning a new language?"},
        {"type": "FREE", "q": "Tell me about a coworker or classmate and their daily habits."},
        {"type": "FREE", "q": "What was the most interesting thing you learned in high school?"},
        {"type": "FREE", "q": "How has your life changed since you entered university?"},
        {"type": "FREE", "q": "Describe a place that you really want to visit someday."},
        {"type": "FREE", "q": "Do you prefer reading books or watching YouTube? Why?"},
        {"type": "FREE", "q": "What kind of job do you want to try in the future?"},
    ],
    "Set D": [
        {"type": "TRANS", "q": "「私は2020年から、ギターを練習しています。」を英語にしてください。"},
        {"type": "TRANS", "q": "「あそこにあるのは、私が一番好きなレストランです。」を英語にしてください。"},
        {"type": "FREE", "q": "What is your favorite season and why?"},
        {"type": "FREE", "q": "What do you think is the best way to stay healthy?"},
        {"type": "FREE", "q": "Who is someone you admire, and what do they do every day?"},
        {"type": "FREE", "q": "What is the best memory from your childhood?"},
        {"type": "FREE", "q": "Have you ever taken up a new sport or habit recently?"},
        {"type": "FREE", "q": "Tell me about a problem that you recently solved."},
        {"type": "FREE", "q": "How do you usually relieve stress?"},
        {"type": "FREE", "q": "How do you think technology will change our lives in 10 years?"},
    ],
}

# 問題文 → (セット名, 問題番号, タイプ)。問題文はセット間で重複しないので、ログの問題文からセットを特定できる
QUESTION_INDEX = {
    q["q"]: (set_name, i + 1, q["type"])
    for set_name, qs in ALL_QUESTIONS.items()
    for i, q in enumerate(qs)
}


# プロンプトと出力形式は prompts.py にまとめてある
from prompts import (BASELINE_PROMPT, CATEGORIES, CLAUSE_PROMPT, CLAUSE_SCHEMA, FEWSHOT_PROMPT, ITEM_SCHEMA,
                     RUBRIC_PROMPT, SCHEMA_PROMPT)


# ======================================================================
# 認証まわり
# ======================================================================

def load_secrets():
    path = ROOT / ".streamlit" / "secrets.toml"
    if not path.exists():
        sys.exit(f"secrets.toml が見つかりません: {path}")
    return load_toml(path)


def make_openai_client():
    import os
    from openai import OpenAI
    key = os.environ.get("OPENAI_API_KEY") or load_secrets()["OPENAI_API_KEY"]
    return OpenAI(api_key=key)


def open_sheet():
    import gspread
    from google.oauth2 import service_account
    gcp_info = dict(load_secrets()["gcp_service_account"])
    gcp_info["private_key"] = gcp_info["private_key"].replace("\\n", "\n")
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = service_account.Credentials.from_service_account_info(gcp_info, scopes=scopes)
    return gspread.authorize(creds).open(SHEET_NAME).sheet1


def open_bucket():
    from google.cloud import storage
    from google.oauth2 import service_account
    gcp_info = dict(load_secrets()["gcp_service_account"])
    gcp_info["private_key"] = gcp_info["private_key"].replace("\\n", "\n")
    creds = service_account.Credentials.from_service_account_info(
        gcp_info, scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return storage.Client(credentials=creds, project=gcp_info["project_id"]).bucket(BUCKET_NAME)


# ======================================================================
# download: GCS の音声 → experiments/audio/（手動文字起こし用）
# ======================================================================

def parse_audio_name(name, user_id):
    """{user}_{SetX}_Q{n}_... (新形式) または {user}_Q{n}_... (旧形式) を (set_name or None, q_num) に分解する"""
    parts = name.split("_")
    if parts[0] != user_id:
        return None  # "KentaH2_..." のような別ユーザーを除外
    set_name, q_num = None, None
    for part in parts[1:]:
        if part.startswith("Set") and len(part) == 4:
            set_name = f"Set {part[3]}"
        elif part.startswith("Q") and part[1:].isdigit():
            q_num = int(part[1:])
            break
    return (set_name, q_num) if q_num else None


def split_audio(blobs, user_id):
    """
    (named, sessions) を返す。
    named: 新形式（ファイル名にセット名あり）の {(セット名, 問題番号): blob}。同じ問題が複数あれば最新を使う
    sessions: 旧形式（セット名なし）を時刻順に並べ、Q1 が出るたびに区切った [{問題番号: blob}, ...]
    """
    named, old = {}, []
    for blob in blobs:
        parsed = parse_audio_name(blob.name, user_id)
        if parsed is None:
            continue
        set_name, q_num = parsed
        if set_name:
            key = (set_name, q_num)
            if key not in named or blob.updated > named[key].updated:
                named[key] = blob
        else:
            old.append((q_num, blob))

    old.sort(key=lambda x: x[1].updated)
    sessions, current = [], {}
    for q_num, blob in old:
        if q_num == 1 and current:
            sessions.append(current)
            current = {}
        if q_num not in current or blob.updated > current[q_num].updated:
            current[q_num] = blob
    if current:
        sessions.append(current)
    return named, sessions


def group_audio(blobs, user_id):
    """
    {(セット名, 問題番号): blob} を返す（download 用）。
    旧形式は reprocess.py と同じく、時刻順で A→B→C→D に割り当てる（その順に受けた前提）。
    """
    files, sessions = split_audio(blobs, user_id)
    for i, sess in enumerate(sessions):
        label = SET_ORDER[i] if i < len(SET_ORDER) else f"Session{i + 1}"
        first = sess[min(sess)].updated.strftime("%m/%d %H:%M")
        note = "" if i < len(SET_ORDER) else "  ⚠️ 5回目以降のセッション（やり直しの可能性。セットとの対応を確認すること）"
        print(f"  旧形式 セッション{i + 1}（{first}〜, {len(sess)}問）→ {label}{note}")
        for q_num, blob in sess.items():
            files.setdefault((label, q_num), blob)
    return files


def cmd_download(args):
    bucket = open_bucket()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for user_id in args.users.split(","):
        print(f"\n{user_id}:")
        files = group_audio(bucket.list_blobs(prefix=f"{user_id}_"), user_id)
        if not files:
            print("  音声が見つかりません")
            continue
        for (set_name, q_num), blob in sorted(files.items()):
            ext = blob.name.rsplit(".", 1)[-1] if "." in blob.name else "wav"
            dest = out_dir / f"{user_id}_{set_name.replace(' ', '')}_Q{q_num:02d}.{ext}"
            if dest.exists() and not args.force:
                continue
            blob.download_to_filename(str(dest))
            print(f"  {dest.name}  ← {blob.name}")
        for set_name in sorted({k[0] for k in files}):
            n = sum(1 for k in files if k[0] == set_name)
            if n != 10:
                print(f"  ⚠️ {set_name}: {n}問しかありません")
    print(f"\n保存先 → {out_dir}")


# ======================================================================
# transcribe: GCS の音声を Whisper で文字起こしし直し、transcripts.csv の抜けを埋める
# ======================================================================

# 和文英訳の Q1・Q2 はセットごとに内容が違うので、文字起こしに出てくる語でセットを判定できる
SET_KEYWORDS = {
    1: {"Set A": ["english"], "Set B": ["piano"], "Set C": ["town", "city"], "Set D": ["guitar"]},
    2: {"Set A": ["book"], "Set B": ["man ", "park"], "Set C": ["cake"], "Set D": ["restaurant"]},
}


def whisper(client, blob):
    ext = blob.name.rsplit(".", 1)[-1] if "." in blob.name else "wav"
    data = blob.download_as_bytes()
    for attempt in range(4):
        try:
            with io.BytesIO(data) as f:
                f.name = f"audio.{ext}"
                return client.audio.transcriptions.create(model="whisper-1", file=f, language="en").text
        except Exception as e:
            if attempt == 3:
                raise
            print(f"    Whisper error ({e}), {2 ** attempt}秒後にリトライ...")
            time.sleep(2 ** attempt)


def classify_session(sess, transcribe):
    """旧形式のセッションのセットを、Q1（なければ Q2）の文字起こしの中身から判定する。判定できなければ None"""
    for q_num in (1, 2):
        if q_num not in sess:
            continue
        text = transcribe(sess[q_num]).lower()
        hits = [set_name for set_name, words in SET_KEYWORDS[q_num].items() if any(w in text for w in words)]
        if len(hits) == 1:
            return hits[0]
    return None


def read_transcript_rows(path):
    if not Path(path).exists():
        return {}
    with open(path, encoding="utf-8-sig") as f:
        return {(r["user_id"], r["set_name"], int(r["q_num"])): r for r in csv.DictReader(f)}


def write_transcript_rows(path, rows):
    records = sorted(rows.values(), key=lambda r: (r["user_id"], r["set_name"], int(r["q_num"])))
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)


def cmd_transcribe(args):
    users = args.users.split(",") if args.users else PARTICIPANTS
    path = Path(args.input)
    rows = read_transcript_rows(path)
    bucket = open_bucket()
    client = None if args.dry_run else make_openai_client()
    cache = {}

    def transcribe(blob):
        if blob.name not in cache:
            cache[blob.name] = whisper(client, blob)
        return cache[blob.name]

    def needs(uid, set_name, q_num):
        r = rows.get((uid, set_name, q_num))
        return args.all or r is None or not (r.get("whisper_transcript") or "").strip()

    for uid in users:
        print(f"\n{uid}:")
        named, sessions = split_audio(bucket.list_blobs(prefix=f"{uid}_"), uid)
        files = dict(named)
        for i, sess in enumerate(sessions, 1):
            first = sess[min(sess)].updated.strftime("%m/%d %H:%M")
            if args.dry_run:
                print(f"  旧形式 セッション{i}（{first}〜, {len(sess)}問）: セットは本実行時に Q1 の中身から判定")
                continue
            set_name = classify_session(sess, transcribe)
            if set_name is None:
                print(f"  旧形式 セッション{i}（{first}〜, {len(sess)}問）→ セットを判定できないのでスキップ（旧バージョンの問題の可能性）")
                continue
            print(f"  旧形式 セッション{i}（{first}〜, {len(sess)}問）→ {set_name}（Q1 の中身から判定）")
            for q_num, blob in sess.items():  # 同じセットを複数回受けていたら、問題ごとに新しい録音を使う
                key = (set_name, q_num)
                if key not in files or blob.updated > files[key].updated:
                    files[key] = blob

        for set_name in SET_ORDER:
            todo = [q for q in range(1, 11) if needs(uid, set_name, q)]
            if not todo:
                continue
            missing_audio = [q for q in todo if (set_name, q) not in files]
            ready = [q for q in todo if (set_name, q) in files]
            note = "（旧形式の音声はまだセットを判定していないので含まれない）" if args.dry_run and sessions else ""
            print(f"  {set_name}: 文字起こし対象 Q{ready}" + (f" / 音声が見つからない Q{missing_audio}{note}" if missing_audio else ""))
            if args.dry_run:
                continue
            for q_num in ready:
                blob = files[(set_name, q_num)]
                text = transcribe(blob)
                q = ALL_QUESTIONS[set_name][q_num - 1]
                row = rows.get((uid, set_name, q_num)) or {
                    "user_id": uid, "set_name": set_name, "q_num": q_num, "type": q["type"],
                    "question": q["q"], "manual_transcript": "",
                }
                row.update({"whisper_transcript": text, "sheet_timestamp": f"rerun:{blob.name}"})
                rows[(uid, set_name, q_num)] = row
                print(f"    Q{q_num}: {text[:60]}")
            write_transcript_rows(path, rows)  # セットごとに保存（途中で止まっても失われない）

    if args.dry_run:
        print("\n（--dry-run なので文字起こしはしていません）")
    else:
        print(f"\n保存先 → {path}（sheet_timestamp が rerun: で始まる行が今回の文字起こし）")


# ======================================================================
# export: スプレッドシート → transcripts.csv
# ======================================================================

CSV_FIELDS = ["user_id", "set_name", "q_num", "type", "question", "whisper_transcript", "manual_transcript", "sheet_timestamp"]


def find_question(row):
    """問題文の列を探して (列番号, 問題情報) を返す。
    アプリは [日時, ID, 問題番号, 問題文, raw, cleaned] の順に書き込むが、シートの D 列に「手動チェック」列が
    挿入されていると1列ずつ右にずれる（問題文が E 列、raw が F 列）。どちらの並びでも読めるようにする。"""
    for col in (3, 4):
        if len(row) > col + 1 and row[col] in QUESTION_INDEX:
            return col, QUESTION_INDEX[row[col]]
    return None, None


def read_sheet_rows(args):
    if args.from_csv:  # Google スプレッドシートの「ファイル → ダウンロード → CSV」で保存したもの
        with open(args.from_csv, encoding="utf-8-sig") as f:
            return list(csv.reader(f))
    return open_sheet().get_all_values()


def cmd_export(args):
    rows = read_sheet_rows(args)
    latest = {}
    skipped = 0
    for row in rows:
        if len(row) < 5 or row[2] in ("FINAL", ""):
            continue
        col, info = find_question(row)
        if info is None:
            skipped += 1  # ヘッダー行や、旧バージョンの問題文
            continue
        set_name, q_num, q_type = info
        key = (row[1], set_name, q_num)
        # 同じ問題が複数回記録されていたら最新を使う（タイムスタンプは "YYYY/MM/DD HH:MM:SS" なので文字列比較で順序が付く）
        if key not in latest or row[0] >= latest[key]["sheet_timestamp"]:
            latest[key] = {
                "user_id": row[1], "set_name": set_name, "q_num": q_num, "type": q_type,
                "question": row[col], "whisper_transcript": row[col + 1], "manual_transcript": "",
                "sheet_timestamp": row[0],
            }

    out = Path(args.out)
    if out.exists() and not args.force:
        sys.exit(f"{out} は既にあります（手動文字起こしを上書きしないよう停止しました）。上書きする場合は --force")
    out.parent.mkdir(parents=True, exist_ok=True)
    records = sorted(latest.values(), key=lambda r: (r["user_id"], r["set_name"], r["q_num"]))
    with open(out, "w", newline="", encoding="utf-8-sig") as f:  # Excel で文字化けしないよう BOM 付き
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(records)

    print(f"{len(records)} 行を書き出しました → {out}（問題文が一致しない行 {skipped} 件はスキップ）")
    for (uid, set_name), n in sorted(Counter((r["user_id"], r["set_name"]) for r in records).items()):
        note = "" if n == 10 else "  ⚠️ 10問そろっていません"
        print(f"  {uid} / {set_name}: {n}問{note}")


# ======================================================================
# run: 採点の繰り返し
# ======================================================================

def load_transcripts(path, text_col):
    """CSV を読み込み、{(user_id, set_name): [{q_num, type, question, answer}, ...]} を返す"""
    sessions = defaultdict(list)
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            answer = (r.get(text_col) or "").strip()
            sessions[(r["user_id"], r["set_name"])].append({
                "q_num": int(r["q_num"]), "type": r["type"], "question": r["question"], "answer": answer,
            })
    for qs in sessions.values():
        qs.sort(key=lambda x: x["q_num"])
    return sessions


def format_answers(questions):
    text = ""
    for q in questions:
        text += f"Q{q['q_num']}: {q['question']}\n回答: {q['answer'] or '[回答なし]'}\n\n"
    return text


def chat(client, model, system, user, response_format, seed):
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format=response_format,
        temperature=0,
    )
    if seed is not None:
        kwargs["seed"] = seed
    for attempt in range(4):
        try:
            return client.chat.completions.create(**kwargs)
        except Exception as e:
            if attempt == 3:
                raise
            print(f"    API error ({e}), {2 ** attempt}秒後にリトライ...")
            time.sleep(2 ** attempt)


def normalize_category(name):
    """AI が返した観点名（"名詞の境界（Nouns & Articles）" など）を4観点のどれかに寄せる"""
    for key, canon in [("時制", "時制"), ("Tense", "時制"), ("一致", "主語と動詞の一致"), ("Agreement", "主語と動詞の一致"),
                       ("名詞", "名詞の境界"), ("Noun", "名詞の境界"), ("構文", "構文・語順"), ("語順", "構文・語順"),
                       ("Syntax", "構文・語順")]:
        if key in name:
            return canon
    return None


def counts_from_baseline(data):
    counts = {c: {"contexts": 0, "errors": 0} for c in CATEGORIES}
    for cat in data.get("categories", []):
        canon = normalize_category(cat.get("name", ""))
        if canon is None:
            continue
        counts[canon]["contexts"] += len(cat.get("obligatory_contexts_list", []))
        counts[canon]["errors"] += len(cat.get("error_list", []))
    return counts


def counts_from_items(items):
    counts = {c: {"contexts": 0, "errors": 0} for c in CATEGORIES}
    for it in items:
        counts[it["category"]]["contexts"] += 1
        counts[it["category"]]["errors"] += int(bool(it["is_error"]))
    return counts


def score(counts, margin):
    """app.py と同じ計算: 全体平均は文脈数で重み付け、化石化 = 観点のエラー率 >= 全体平均 + margin"""
    total_e = sum(c["errors"] for c in counts.values())
    total_c = sum(c["contexts"] for c in counts.values())
    overall = total_e / total_c * 100 if total_c else 0.0
    cats = {}
    for name, c in counts.items():
        rate = c["errors"] / c["contexts"] * 100 if c["contexts"] else 0.0
        cats[name] = {**c, "rate": rate, "fossilized": rate >= overall + margin}
    return overall, cats


def counts_from_clauses(clauses):
    """プロンプトB の節ごとの出力を、観点ごとの件数にまとめる（skip の節と applicable=false の質問は数えない）"""
    counts = {c: {"contexts": 0, "errors": 0} for c in CATEGORIES}
    for cl in clauses:
        if cl["skip"]:
            continue
        for key, cat in [("tense", "時制"), ("agreement", "主語と動詞の一致"), ("syntax", "構文・語順")]:
            if cl[key]["applicable"]:
                counts[cat]["contexts"] += 1
                counts[cat]["errors"] += int(bool(cl[key]["is_error"]))
        for np_ in cl["noun_phrases"]:
            counts["名詞の境界"]["contexts"] += 1
            counts["名詞の境界"]["errors"] += int(bool(np_["is_error"]))
    return counts


ITEM_PROMPTS = {"schema": SCHEMA_PROMPT, "a_rubric": RUBRIC_PROMPT, "a_rubric_perq": RUBRIC_PROMPT, "c_fewshot": FEWSHOT_PROMPT}


def run_once(client, model, condition, questions):
    """1回分の採点。(counts, 生の出力リスト, system_fingerprint) を返す"""
    seed = None if condition == "baseline" else SEED
    if condition in ("baseline", "seed"):
        resp = chat(client, model, BASELINE_PROMPT, format_answers(questions), {"type": "json_object"}, seed)
        content = resp.choices[0].message.content
        return counts_from_baseline(json.loads(content)), [content], resp.system_fingerprint

    if condition == "b_clause":
        resp = chat(client, model, CLAUSE_PROMPT, format_answers(questions), CLAUSE_SCHEMA, seed)
        content = resp.choices[0].message.content
        return counts_from_clauses(json.loads(content)["clauses"]), [content], resp.system_fingerprint

    system = ITEM_PROMPTS[condition]
    groups = [[q] for q in questions if q["answer"]] if condition == "a_rubric_perq" else [questions]
    items, raws, fingerprint = [], [], None
    for g in groups:
        resp = chat(client, model, system, format_answers(g), ITEM_SCHEMA, seed)
        content = resp.choices[0].message.content
        items.extend(json.loads(content)["items"])
        raws.append(content)
        fingerprint = resp.system_fingerprint
    return counts_from_items(items), raws, fingerprint


def read_results(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def cmd_run(args):
    conditions = args.conditions.split(",")
    unknown = [c for c in conditions if c not in ALL_CONDITIONS]
    if unknown:
        sys.exit(f"不明な条件: {unknown}（選べるのは {ALL_CONDITIONS}）")
    text_col = "whisper_transcript" if args.text == "whisper" else "manual_transcript"

    sessions = load_transcripts(args.input, text_col)
    users = args.users.split(",") if args.users else PARTICIPANTS
    sessions = {k: v for k, v in sessions.items() if k[0] in users}
    if args.sets:
        sessions = {k: v for k, v in sessions.items() if k[1] in [s.strip() for s in args.sets.split(",")]}
    incomplete = sorted(k for k, v in sessions.items() if sum(1 for q in v if q["answer"]) < args.min_questions)
    for uid, set_name in incomplete:
        print(f"  ⚠️ {uid} / {set_name}: 回答が {args.min_questions} 問そろっていないので除外")
    sessions = {k: v for k, v in sessions.items() if k not in incomplete}
    if not sessions:
        sys.exit(f"対象データがありません（{text_col} 列が空でないか、--users / --sets を確認してください）")

    results_path = Path(args.results)
    results_path.parent.mkdir(parents=True, exist_ok=True)
    done = {(r["condition"], r["text"], r["user_id"], r["set_name"], r["run"], r["model"]) for r in read_results(results_path)}

    jobs = [
        (cond, uid, set_name, run)
        for cond in conditions
        for (uid, set_name) in sorted(sessions)
        for run in range(1, args.runs + 1)
        if (cond, args.text, uid, set_name, run, args.model) not in done
    ]
    print(f"対象: {len(sessions)}セッション × 条件{conditions} × {args.runs}回 → 未実行 {len(jobs)} 件（実行済み分はスキップ）")
    if not jobs:
        return

    client = make_openai_client()
    lock = threading.Lock()

    def work(job):
        cond, uid, set_name, run = job
        questions = sessions[(uid, set_name)]
        counts, raws, fingerprint = run_once(client, args.model, cond, questions)
        overall, cats = score(counts, args.margin)
        record = {
            "condition": cond, "text": args.text, "user_id": uid, "set_name": set_name, "run": run,
            "model": args.model, "system_fingerprint": fingerprint, "margin": args.margin,
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "overall_rate": overall, "categories": cats, "raw_outputs": raws,
        }
        with lock:
            with open(results_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return job, overall

    finished = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(work, j) for j in jobs]
        for fut in as_completed(futures):
            finished += 1
            try:
                (cond, uid, set_name, run), overall = fut.result()
                print(f"  [{finished}/{len(jobs)}] {cond:10s} {uid} / {set_name} #{run}: 全体エラー率 {overall:.1f}%")
            except Exception as e:
                print(f"  [{finished}/{len(jobs)}] ❌ 失敗: {e}（もう一度 run すれば失敗分だけ再実行されます）")
    print(f"\n完了 → {results_path}\n集計: python experiments/stability.py summarize")


# ======================================================================
# summarize: ぶれの集計
# ======================================================================

def sd(xs):
    return statistics.stdev(xs) if len(xs) >= 2 else 0.0


def cmd_summarize(args):
    records = read_results(Path(args.results))
    if args.model:
        records = [r for r in records if r["model"] == args.model]
    if not records:
        sys.exit("結果がありません。先に run を実行してください。")

    # margin を変えて集計し直せるよう、化石化判定は保存済みの件数から計算し直す
    margin = args.margin
    groups = defaultdict(list)  # (condition, text, user, set) → [record]
    for r in records:
        counts = {c: {"contexts": v["contexts"], "errors": v["errors"]} for c, v in r["categories"].items()}
        overall, cats = score(counts, margin)
        groups[(r["condition"], r["text"], r["user_id"], r["set_name"])].append((overall, cats))

    cell_rows = []
    for (cond, text, uid, set_name), runs in sorted(groups.items()):
        overall_list = [o for o, _ in runs]
        for cat in CATEGORIES:
            rates = [c[cat]["rate"] for _, c in runs]
            ctxs = [c[cat]["contexts"] for _, c in runs]
            errs = [c[cat]["errors"] for _, c in runs]
            flags = [c[cat]["fossilized"] for _, c in runs]
            n_true = sum(flags)
            cell_rows.append({
                "condition": cond, "text": text, "user_id": uid, "set_name": set_name, "category": cat,
                "n_runs": len(runs),
                "rate_mean": statistics.mean(rates), "rate_sd": sd(rates), "rate_min": min(rates), "rate_max": max(rates),
                "rate_range": max(rates) - min(rates),
                "contexts_mean": statistics.mean(ctxs), "contexts_sd": sd(ctxs),
                "errors_mean": statistics.mean(errs), "errors_sd": sd(errs),
                "fossil_true": n_true,
                "fossil_agreement": max(n_true, len(flags) - n_true) / len(flags),
                "fossil_flipped": 0 < n_true < len(flags),
                "overall_mean": statistics.mean(overall_list), "overall_sd": sd(overall_list),
            })

    # 条件ごとのまとめ（値が小さいほど安定。fossil_agreement は 1.0 が完全一致）
    by_cond = defaultdict(list)
    for row in cell_rows:
        by_cond[(row["condition"], row["text"])].append(row)
    cond_order = {c: i for i, c in enumerate(ALL_CONDITIONS)}
    cond_rows = []
    for (cond, text), rows in sorted(by_cond.items(), key=lambda kv: (kv[0][1], cond_order.get(kv[0][0], 99))):
        sessions = {(r["user_id"], r["set_name"]): r for r in rows}
        cond_rows.append({
            "condition": cond, "text": text, "sessions": len(sessions),
            "runs_per_session": min(r["n_runs"] for r in rows),
            "mean_rate_sd": statistics.mean(r["rate_sd"] for r in rows),
            "mean_rate_range": statistics.mean(r["rate_range"] for r in rows),
            "mean_contexts_sd": statistics.mean(r["contexts_sd"] for r in rows),
            "mean_overall_sd": statistics.mean(r["overall_sd"] for r in sessions.values()),
            "fossil_agreement": statistics.mean(r["fossil_agreement"] for r in rows),
            "flipped_cells": sum(r["fossil_flipped"] for r in rows),
            "cells": len(rows),
        })

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in [("summary_cells.csv", cell_rows), ("summary_conditions.csv", cond_rows)]:
        with open(out_dir / name, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for row in rows:
                writer.writerow({k: round(v, 3) if isinstance(v, float) else v for k, v in row.items()})

    print(f"化石化の判定基準: 観点のエラー率 >= 全体平均 + {margin}ポイント\n")
    print(f"{'条件':<13}{'テキスト':<9}{'セッション':>6}{'回数':>5}{'エラー率SD':>11}{'エラー率幅':>10}"
          f"{'文脈数SD':>9}{'全体SD':>8}{'化石化一致率':>11}{'判定が割れた':>10}")
    for r in cond_rows:
        print(f"{r['condition']:<14}{r['text']:<9}{r['sessions']:>9}{r['runs_per_session']:>6}"
              f"{r['mean_rate_sd']:>12.1f}{r['mean_rate_range']:>12.1f}{r['mean_contexts_sd']:>11.1f}"
              f"{r['mean_overall_sd']:>9.1f}{r['fossil_agreement'] * 100:>13.0f}%{r['flipped_cells']:>8}/{r['cells']}")
    print("\n（SD・幅は値が小さいほど安定。化石化一致率は、同じ判定になった実行の割合の平均）")
    print(f"詳細 → {out_dir / 'summary_cells.csv'}, {out_dir / 'summary_conditions.csv'}")


# ======================================================================

def main():
    p = argparse.ArgumentParser(description="採点のぶれ（再現性）の再実験")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("download", help="GCS の音声をセット名付きのファイル名でダウンロードする")
    d.add_argument("--users", required=True, help="カンマ区切り（例: KentaH）")
    d.add_argument("--out", default=str(EXP_DIR / "audio"))
    d.add_argument("--force", action="store_true", help="既にあるファイルも上書きする")
    d.set_defaults(func=cmd_download)

    t = sub.add_parser("transcribe", help="GCS の音声を Whisper で文字起こしし直し、transcripts.csv の抜けを埋める")
    t.add_argument("--users", help=f"カンマ区切り（既定: {','.join(PARTICIPANTS)}）")
    t.add_argument("--input", default=str(DEFAULT_TRANSCRIPTS))
    t.add_argument("--all", action="store_true", help="抜けだけでなく、全問を文字起こしし直す")
    t.add_argument("--dry-run", action="store_true", help="API を呼ばず、対象と音声の有無だけ表示する")
    t.set_defaults(func=cmd_transcribe)

    e = sub.add_parser("export", help="スプレッドシートの書き起こしを CSV に書き出す")
    e.add_argument("--out", default=str(DEFAULT_TRANSCRIPTS))
    e.add_argument("--force", action="store_true", help="既存の CSV を上書きする")
    e.add_argument("--from-csv", help="GCP 認証を使わず、スプレッドシートから手動でダウンロードした CSV を読む")
    e.set_defaults(func=cmd_export)

    r = sub.add_parser("run", help="条件ごとに N 回採点する")
    r.add_argument("--input", default=str(DEFAULT_TRANSCRIPTS))
    r.add_argument("--results", default=str(DEFAULT_RESULTS))
    r.add_argument("--text", choices=["whisper", "manual"], default="whisper", help="どちらの書き起こしを採点するか")
    r.add_argument("--conditions", default=",".join(MAIN_CONDITIONS),
                   help=f"カンマ区切り。既定はメインの4条件。選べるのは {ALL_CONDITIONS}")
    r.add_argument("--runs", type=int, default=5)
    r.add_argument("--users", help=f"カンマ区切りで対象テスターを指定（既定: {','.join(PARTICIPANTS)}）")
    r.add_argument("--sets", help='カンマ区切りで対象セットを絞る（例: "Set A,Set B"）')
    r.add_argument("--model", default="gpt-4o")
    r.add_argument("--margin", type=float, default=15.0, help="化石化判定: 全体平均 + 何ポイントか")
    r.add_argument("--workers", type=int, default=4, help="同時に投げるリクエスト数")
    r.add_argument("--min-questions", type=int, default=10, help="回答がこの問題数に満たないセットは除外する")
    r.set_defaults(func=cmd_run)

    s = sub.add_parser("summarize", help="ぶれを集計する")
    s.add_argument("--results", default=str(DEFAULT_RESULTS))
    s.add_argument("--out-dir", default=str(EXP_DIR / "results"))
    s.add_argument("--model", help="特定のモデルの結果だけ集計する")
    s.add_argument("--margin", type=float, default=15.0, help="化石化判定: 全体平均 + 何ポイントか（後から変えて集計し直せる）")
    s.set_defaults(func=cmd_summarize)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
