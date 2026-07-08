#!/usr/bin/env python3
"""
reprocess.py — GCSに保存済みの音声ファイルを使って、指定テスターの実験を再処理する。

事前準備:
  1. スプレッドシートから対象テスターの行を全て手動削除する（FINALも含む）
  2. 下の REPROCESS_TARGETS に再処理したいテスターIDとセット名を指定する
  3. python reprocess.py を実行する

注意: .streamlit/secrets.toml に OPENAI_API_KEY が必要です。
"""

import io
import json
import time
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

from openai import OpenAI
from google.cloud import storage
import gspread
from google.oauth2 import service_account

# ===== ここを編集して対象テスターを指定 =====
REPROCESS_TARGETS = [
    {"user_id": "HarunaK", "set_name": "Set A"},
    {"user_id": "HarunaK", "set_name": "Set B"},
    {"user_id": "HarunaK", "set_name": "Set C"},
    {"user_id": "HarunaK", "set_name": "Set D"},
    {"user_id": "MakoI",   "set_name": "Set A"},
    {"user_id": "MakoI",   "set_name": "Set B"},
    {"user_id": "MakoI",   "set_name": "Set C"},
    {"user_id": "MakoI",   "set_name": "Set D"},
    {"user_id": "HaruhiK", "set_name": "Set A"},
    {"user_id": "HaruhiK", "set_name": "Set B"},
    {"user_id": "HaruhiK", "set_name": "Set C"},
    {"user_id": "HaruhiK", "set_name": "Set D"},
    {"user_id": "TaiseiW", "set_name": "Set A"},
    # KentaH（研究者自身のデータ）は必要なら追加:
    # {"user_id": "KentaH", "set_name": "Set A"},
]
# ============================================

SHEET_NAME = "English_AI_Logs"
BUCKET_NAME = "kentaengspeakingtest202605131619"

# --- 認証 ---
secrets_path = Path(__file__).parent / ".streamlit" / "secrets.toml"
secrets = load_toml(secrets_path)

gcp_info = dict(secrets["gcp_service_account"])
gcp_info["private_key"] = gcp_info["private_key"].replace("\\n", "\n")

client = OpenAI(api_key=secrets["OPENAI_API_KEY"])
scopes = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/cloud-platform",
]
creds = service_account.Credentials.from_service_account_info(gcp_info, scopes=scopes)
gc = gspread.authorize(creds)
storage_client = storage.Client(credentials=creds, project=gcp_info["project_id"])

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

# --- OpenAI 呼び出しヘルパー ---
def call_openai_chat(messages, response_format=None, temperature=0):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                response_format=response_format,
                temperature=temperature,
            )
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"    API error ({e}), {2**attempt}秒後にリトライ...")
            time.sleep(2 ** attempt)


SET_ORDER = ["Set A", "Set B", "Set C", "Set D"]


def list_audio_sessions(user_id):
    """
    全音声ファイルをタイムスタンプ順に並べ、Q1の出現をトリガーにセッション（セット）ごとに分割する。
    Returns: list of {q_num: blob} (古いセッションが先頭)
    """
    bucket = storage_client.bucket(BUCKET_NAME)
    blobs = list(bucket.list_blobs(prefix=f"{user_id}_Q"))

    # Q番号を持つblobのみ抽出 & タイムスタンプ順ソート
    valid = []
    for blob in blobs:
        parts = blob.name.split("_")
        # 旧形式: user_Q1_timestamp  新形式: user_SetA_Q1_timestamp
        q_part = None
        for part in parts[1:]:
            if part.startswith("Q") and part[1:].isdigit():
                q_part = part
                break
        if q_part:
            valid.append((int(q_part[1:]), blob))

    valid.sort(key=lambda x: x[1].updated)

    sessions = []
    current = {}
    for q_num, blob in valid:
        if q_num == 1 and current:
            sessions.append(current)
            current = {}
        if q_num not in current or blob.updated > current[q_num].updated:
            current[q_num] = blob
    if current:
        sessions.append(current)

    return sessions


def download_blob(blob):
    buf = io.BytesIO()
    blob.download_to_file(buf)
    buf.seek(0)
    return buf.read()


def transcribe_and_clean(audio_bytes, ext="wav"):
    """Whisper文字起こし → ASRノイズのみクリーンアップ（文法エラーは残す）"""
    with io.BytesIO(audio_bytes) as f:
        f.name = f"audio.{ext}"
        result = client.audio.transcriptions.create(model="whisper-1", file=f, language="en")
    raw = result.text

    cleanup_prompt = (
        "以下は英語学習者の発話の音声認識結果です。文脈から考えて明らかな音声認識の誤り"
        "（例: 'crab activity' は文脈上 'club activity' の誤認識、'play for' は 'prefer' の誤認識など）を、"
        "文脈から判断して正しい単語に直してください。言い淀み(uh, umなど)は除去してかまいません。"
        "ただし、学習者本人の文法的な誤り（3単現のsの脱落、時制の誤り、冠詞の誤りなど）は絶対に修正せず、そのまま残すこと。"
        "出力はクリーニング済みのテキストのみとし、説明や前置きは不要です。"
        f"\n\n【音声認識結果】\n{raw}"
    )
    resp = call_openai_chat(messages=[{"role": "user", "content": cleanup_prompt}])
    cleaned = resp.choices[0].message.content.strip()
    return raw, cleaned


def run_analysis(results):
    """10問分のクリーン書き起こしを分析してresult_data辞書を返す"""
    summary_text = ""
    for i, res in enumerate(results):
        summary_text += f"Q{i+1}: {res['question']}\n回答: {res['answer']}\n\n"

    analysis_prompt = """
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

    resp = call_openai_chat(
        messages=[{"role": "system", "content": analysis_prompt}, {"role": "user", "content": summary_text}],
        response_format={"type": "json_object"},
    )
    result_data = json.loads(resp.choices[0].message.content)

    # Python側で件数・エラー率・化石化判定を計算
    for cat in result_data["categories"]:
        cat["obligatory_contexts"] = len(cat["obligatory_contexts_list"])
        cat["error_count"] = len(cat["error_list"])

    total_errors = sum(c["error_count"] for c in result_data["categories"])
    total_contexts = sum(c["obligatory_contexts"] for c in result_data["categories"])
    overall_avg = (total_errors / total_contexts * 100) if total_contexts > 0 else 0

    for cat in result_data["categories"]:
        rate = (cat["error_count"] / cat["obligatory_contexts"] * 100) if cat["obligatory_contexts"] > 0 else 0
        cat["error_rate"] = rate
        cat["is_fossilized"] = bool(rate >= overall_avg + 15.0)

    result_data["overall_average_error_rate"] = overall_avg
    return result_data


def process_tester(user_id, set_name):
    print(f"\n{'='*55}")
    print(f"処理開始: {user_id} / {set_name}")
    questions = ALL_QUESTIONS[set_name]
    sheet = gc.open(SHEET_NAME).sheet1
    timestamp_base = datetime.now().strftime("%Y/%m/%d %H:%M:%S")

    # セッション分割してセット対応を確認
    sessions = list_audio_sessions(user_id)
    set_index = SET_ORDER.index(set_name)

    print(f"  検出されたセッション数: {len(sessions)}")
    for i, sess in enumerate(sessions):
        q_nums = sorted(sess.keys())
        first_t = sess[q_nums[0]].updated.strftime("%m/%d %H:%M")
        last_t  = sess[q_nums[-1]].updated.strftime("%H:%M")
        marker = "  ← ★今回使用" if i == set_index else ""
        print(f"    Session {i} ({first_t}〜{last_t})  Q{q_nums}{marker}")

    if set_index >= len(sessions):
        print(f"⚠️  {set_name} に対応するセッション(index {set_index})が見つかりません。スキップします。")
        return

    question_map = sessions[set_index]
    missing = [i+1 for i in range(len(questions)) if (i+1) not in question_map]
    if missing:
        print(f"⚠️  音声が見つからない問題: Q{missing}  → スキップします")

    results = []
    for i, q in enumerate(questions):
        q_num = i + 1
        if q_num not in question_map:
            results.append({"question": q["q"], "type": q["type"], "answer": "[音声なし]"})
            continue

        blob = question_map[q_num]
        ext = blob.name.rsplit(".", 1)[-1] if "." in blob.name else "wav"
        print(f"  Q{q_num}: {blob.name}")
        audio_bytes = download_blob(blob)

        print(f"       文字起こし・クリーンアップ中...")
        raw, cleaned = transcribe_and_clean(audio_bytes, ext)
        print(f"       raw:     {raw[:70]}")
        print(f"       cleaned: {cleaned[:70]}")

        sheet.append_row([timestamp_base, user_id, q_num, q["q"], raw, cleaned])
        results.append({"question": q["q"], "type": q["type"], "answer": raw})
        time.sleep(0.5)

    print(f"\n  総合分析中...")
    result_data = run_analysis(results)

    timestamp_final = datetime.now().strftime("%Y/%m/%d %H:%M:%S")
    sheet.append_row([timestamp_final, user_id, "FINAL", "総合診断レポート", "", json.dumps(result_data, ensure_ascii=False)])

    print(f"\n  完了！ 全体平均エラー率: {result_data['overall_average_error_rate']:.1f}%")
    for cat in result_data["categories"]:
        flag = "⚠️ 化石化" if cat["is_fossilized"] else "✅     "
        print(f"    {flag}  {cat['name']}: {cat['error_rate']:.1f}%")


if __name__ == "__main__":
    print("=" * 55)
    print("バッチ再処理スクリプト")
    print("対象:")
    for t in REPROCESS_TARGETS:
        print(f"  - {t['user_id']} / {t['set_name']}")
    print("=" * 55)
    # --- セッション割り当てのプレビュー ---
    print("\n【セッション割り当てプレビュー】")
    checked_users = set()
    for target in REPROCESS_TARGETS:
        uid = target["user_id"]
        if uid in checked_users:
            continue
        checked_users.add(uid)
        sessions = list_audio_sessions(uid)
        print(f"\n  {uid}: {len(sessions)}セッション検出")
        for i, sess in enumerate(sessions):
            q_nums = sorted(sess.keys())
            first_t = sess[q_nums[0]].updated.strftime("%m/%d %H:%M")
            last_t  = sess[q_nums[-1]].updated.strftime("%H:%M")
            matched = [t["set_name"] for t in REPROCESS_TARGETS if t["user_id"] == uid and SET_ORDER.index(t["set_name"]) == i]
            label = f"→ {matched[0]}" if matched else "(対象外)"
            print(f"    Session {i} ({first_t}〜{last_t})  Q{q_nums}  {label}")

    print("\n上のセッション割り当てが正しければ処理を開始します。")
    print("⚠️  スプレッドシートから対象テスターの行を削除しましたか？")
    ans = input("問題なければ 'yes' を入力（中断する場合は他の文字）: ").strip().lower()
    if ans != "yes":
        print("中断しました。")
        exit(0)

    for target in REPROCESS_TARGETS:
        process_tester(target["user_id"], target["set_name"])

    print("\n✅ 全処理完了。")
