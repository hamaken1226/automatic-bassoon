#!/usr/bin/env python3
"""
stability.py — 採点のぶれ（再現性）を検証する再実験スクリプト。

同じ書き起こしテキストを、条件を変えながら GPT-4o で N 回ずつ採点し、
エラー率・必須文脈数・化石化判定が実行ごとにどれだけ揺れるかを集計する。
書き起こしは固定して使う（Whisper を毎回かけ直さない）ので、測っているのは純粋に採点（LLM）側のぶれ。

使い方:
  1. 書き起こしをスプレッドシートから CSV に書き出す（manual_transcript 列は空で出力される）
       python experiments/stability.py export
     → experiments/transcripts.csv ができる。音声を聞きながら manual_transcript 列を埋めれば手動文字起こし版になる。

  2. 採点を繰り返す（結果は experiments/results/runs.jsonl に追記。途中で止めても続きから再開できる）
       python experiments/stability.py run --users KentaH --runs 5
       python experiments/stability.py run --text manual --users KentaH --runs 5

  3. 集計する
       python experiments/stability.py summarize

条件（--conditions で選択。左から順に1要素ずつ追加していく段階的な設計）:
  baseline   app.py と同じプロンプト（temperature=0、10問まとめて1回で採点）
  seed       baseline + seed を固定
  schema     seed + 出力を「1箇所＝1項目（is_error 付き）」の構造化 JSON に変更し、フィードバック文の生成を省く
  rules      schema + 観点ごとの必須文脈の数え方（数える単位）を明文化
  rules_perq rules + 1問ずつ別々に採点して合算

注意: .streamlit/secrets.toml（OPENAI_API_KEY, gcp_service_account）が必要。export のみ GCP 認証を使う。
"""

import argparse
import csv
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
CATEGORIES = ["時制", "主語と動詞の一致", "名詞の境界", "構文・語順"]
ALL_CONDITIONS = ["baseline", "seed", "schema", "rules", "rules_perq"]
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


# ======================================================================
# プロンプト
# ======================================================================

# baseline / seed: app.py の analysis_prompt と同一
BASELINE_PROMPT = """
        あなたは第二言語習得（SLA）の専門家およびデータアナリストです。
        提供された発話データを分析し、以下のJSONスキーマに厳密に従ってデータを出力してください。
        （※Markdownなどの装飾は一切含めず、純粋なJSONオブジェクトのみを出力すること）

        【分析の4観点】
        1. 時制（Tense）
        2. 主語と動詞の一致（Agreement）
        3. 名詞の境界（Nouns & Articles）
        4. 構文・語順（Syntax）

        【重要・数え方のルール】
        各観点について、いきなり個数を答えてはいけない。まず本文の最初から最後まで漏れなく確認し、
        該当する箇所を一つずつ全て抜き出して obligatory_contexts_list に追加すること（「目立つエラー」だけを拾うのではなく、
        正しく使えている箇所も含めて、その文法規則が適用される場面を全部リストアップする）。
        そのうち実際に誤っていた箇所だけを error_list に追加すること。個数（件数）はこちら（Python側）でリストの長さから算出するので、
        あなたは個数を書く必要はない。

        【Self-Repair（自己修正）の除外ルール】
        学習者が発話中に言い直した箇所は、自己モニター機能が働いている証拠であり、エラーではない。
        obligatory_contexts_list・error_listのどちらにも含めないこと。
        例1: "I go... I went to the park." → 正しく自己修正できているため、カウントしない。
        例2: 単純な言い淀みや繰り返し（"I I love driving"など）、音声認識のノイズらしき箇所も、文法エラーとして数えない。

        【言語に関する重要な指示】
        "overall_summary"・"details"・"advice"の文章は、テスター（学習者本人）に直接渡すフィードバックです。
        必ず**日本語**で書くこと（英語で書いてはいけない）。obligatory_contexts_list・error_listの引用部分は元の発話のまま英語でよい。

        【出力JSONフォーマット】
        {
            "overall_summary": "学習者のスピーキング傾向についての総評（2〜3文、日本語）",
            "categories": [
                {
                    "name": "時制",
                    "obligatory_contexts_list": ["I have been studying (Q1)", "This is a book (Q2)"],
                    "error_list": ["go -> went (Q3)"],
                    "details": "エラーの具体例（元の発話の引用）と分析（日本語で記述）"
                }
            ],
            "advice": "今後の学習アドバイス（日本語）"
        }
        """

_ITEM_COMMON = """
あなたは第二言語習得（SLA）の専門家です。英語学習者の発話の書き起こしを読み、4つの文法観点について
「その文法規則が適用される箇所（必須文脈）」を、正しく使えている箇所も含めてすべて抜き出してください。

【4観点】時制 / 主語と動詞の一致 / 名詞の境界 / 構文・語順

【出力のルール】
- 該当箇所を1つ見つけるごとに items に1項目を追加する。正しい箇所は is_error=false、誤りは is_error=true とする。
- 発話の最初から最後まで、問題番号の順に漏れなく確認すること。目立つ誤りだけを拾ってはいけない。
- q には問題番号（例: "Q3"）、quote には該当部分を元の発話のまま英語で引用する。
- correction には、誤りの場合は正しい形を、正しい場合は空文字を入れる。

【除外ルール】
- 学習者が発話中に言い直した箇所（Self-Repair）は、言い直す前・後のどちらも items に含めない。
  例: "I go... I went to the park." → go も went も数えない。
- 単純な言い淀みや繰り返し（"I I love driving" など）、音声認識のノイズらしき箇所も数えない。
"""

SCHEMA_PROMPT = _ITEM_COMMON

RULES_PROMPT = _ITEM_COMMON + """
【必須文脈の数え方（数える単位）】※この定義に厳密に従い、定義にない箇所は数えないこと
- 時制: 述語動詞（主語に対応する定形動詞。助動詞＋動詞は1つのまとまりとして扱う）1つにつき1件。
  to不定詞・動名詞・分詞の単独用法は数えない。話している内容の時間（過去・現在・未来・継続など）に合わない形なら誤り。
- 主語と動詞の一致: 人称・数で形が変わる述語動詞1つにつき1件。具体的には、一般動詞の現在形、be動詞（am/is/are/was/were）、
  have/has、do/does。一般動詞の過去形や助動詞（can, will など）の後の動詞は数えない。主語の人称・数と合っていなければ誤り。
- 名詞の境界: 普通名詞を中心とする名詞句1つにつき1件。固有名詞・代名詞は数えない。
  冠詞（a/an/the）の有無・選択、または単数形・複数形が誤っていれば誤り。
- 構文・語順: 節（主語と述語動詞のまとまり）1つにつき1件。語順の崩れ、必須要素（主語・動詞・目的語など）の欠落、
  関係詞節などの構造の誤りがあれば誤り。

【1つの誤りは1観点だけ】
1つの誤りは、最もよく当てはまる1つの観点にだけ is_error=true として記録する
（例: 3単現の s の抜けは「主語と動詞の一致」のみ。「時制」の誤りにはしない）。
"""

ITEM_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "obligatory_contexts",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "category": {"type": "string", "enum": CATEGORIES},
                            "q": {"type": "string"},
                            "quote": {"type": "string"},
                            "is_error": {"type": "boolean"},
                            "correction": {"type": "string"},
                        },
                        "required": ["category", "q", "quote", "is_error", "correction"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["items"],
            "additionalProperties": False,
        },
    },
}


# ======================================================================
# 認証まわり
# ======================================================================

def load_secrets():
    path = ROOT / ".streamlit" / "secrets.toml"
    if not path.exists():
        sys.exit(f"secrets.toml が見つかりません: {path}")
    return load_toml(path)


def make_openai_client():
    from openai import OpenAI
    return OpenAI(api_key=load_secrets()["OPENAI_API_KEY"])


def open_sheet():
    import gspread
    from google.oauth2 import service_account
    gcp_info = dict(load_secrets()["gcp_service_account"])
    gcp_info["private_key"] = gcp_info["private_key"].replace("\\n", "\n")
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = service_account.Credentials.from_service_account_info(gcp_info, scopes=scopes)
    return gspread.authorize(creds).open(SHEET_NAME).sheet1


# ======================================================================
# export: スプレッドシート → transcripts.csv
# ======================================================================

CSV_FIELDS = ["user_id", "set_name", "q_num", "type", "question", "whisper_transcript", "manual_transcript", "sheet_timestamp"]


def cmd_export(args):
    rows = open_sheet().get_all_values()
    latest = {}
    skipped = 0
    for row in rows:
        if len(row) < 5 or row[2] in ("FINAL", ""):
            continue
        info = QUESTION_INDEX.get(row[3])
        if info is None:
            skipped += 1  # ヘッダー行や、旧バージョンの問題文
            continue
        set_name, q_num, q_type = info
        key = (row[1], set_name, q_num)
        # 同じ問題が複数回記録されていたら最新を使う（タイムスタンプは "YYYY/MM/DD HH:MM:SS" なので文字列比較で順序が付く）
        if key not in latest or row[0] >= latest[key]["sheet_timestamp"]:
            latest[key] = {
                "user_id": row[1], "set_name": set_name, "q_num": q_num, "type": q_type,
                "question": row[3], "whisper_transcript": row[4], "manual_transcript": "",
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


def run_once(client, model, condition, questions):
    """1回分の採点。(counts, 生の出力リスト, system_fingerprint) を返す"""
    seed = None if condition == "baseline" else SEED
    if condition in ("baseline", "seed"):
        resp = chat(client, model, BASELINE_PROMPT, format_answers(questions), {"type": "json_object"}, seed)
        content = resp.choices[0].message.content
        return counts_from_baseline(json.loads(content)), [content], resp.system_fingerprint

    system = SCHEMA_PROMPT if condition == "schema" else RULES_PROMPT
    if condition in ("schema", "rules"):
        groups = [questions]
    else:  # rules_perq: 1問ずつ
        groups = [[q] for q in questions if q["answer"]]
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
    if args.users:
        sessions = {k: v for k, v in sessions.items() if k[0] in args.users.split(",")}
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
    print(f"{'条件':<11}{'テキスト':<9}{'セッション':>6}{'回数':>5}{'エラー率SD':>11}{'エラー率幅':>10}"
          f"{'文脈数SD':>9}{'全体SD':>8}{'化石化一致率':>11}{'判定が割れた':>10}")
    for r in cond_rows:
        print(f"{r['condition']:<11}{r['text']:<9}{r['sessions']:>9}{r['runs_per_session']:>6}"
              f"{r['mean_rate_sd']:>12.1f}{r['mean_rate_range']:>12.1f}{r['mean_contexts_sd']:>11.1f}"
              f"{r['mean_overall_sd']:>9.1f}{r['fossil_agreement'] * 100:>13.0f}%{r['flipped_cells']:>8}/{r['cells']}")
    print("\n（SD・幅は値が小さいほど安定。化石化一致率は、同じ判定になった実行の割合の平均）")
    print(f"詳細 → {out_dir / 'summary_cells.csv'}, {out_dir / 'summary_conditions.csv'}")


# ======================================================================

def main():
    p = argparse.ArgumentParser(description="採点のぶれ（再現性）の再実験")
    sub = p.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("export", help="スプレッドシートの書き起こしを CSV に書き出す")
    e.add_argument("--out", default=str(DEFAULT_TRANSCRIPTS))
    e.add_argument("--force", action="store_true", help="既存の CSV を上書きする")
    e.set_defaults(func=cmd_export)

    r = sub.add_parser("run", help="条件ごとに N 回採点する")
    r.add_argument("--input", default=str(DEFAULT_TRANSCRIPTS))
    r.add_argument("--results", default=str(DEFAULT_RESULTS))
    r.add_argument("--text", choices=["whisper", "manual"], default="whisper", help="どちらの書き起こしを採点するか")
    r.add_argument("--conditions", default=",".join(ALL_CONDITIONS))
    r.add_argument("--runs", type=int, default=5)
    r.add_argument("--users", help="カンマ区切りで対象テスターを絞る（例: KentaH）")
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
