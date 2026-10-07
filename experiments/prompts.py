"""
prompts.py — 再実験で比較する採点プロンプト。

メインの比較（現状 vs キーポイントの異なる3つ）:
  baseline   現状の app.py の採点プロンプト
  a_rubric   プロンプトA「定義の明文化」: 何を1件と数えるかを観点ごとに厳密に定義する
  b_clause   プロンプトB「手順の固定」: 発話を節に分け、節ごとに決まった質問に順番に答えさせる
  c_fewshot  プロンプトC「採点例の提示」: 定義は最小限にし、採点済みの例を見せて数え方を真似させる

A と C は同じ出力形式（ITEM_SCHEMA）、B は節ごとの出力形式（CLAUSE_SCHEMA）。
件数・エラー率・化石化判定は、どのプロンプトでも Python 側で計算する。

補助の分析用（改善のうち、どこまでが乱数の固定や出力形式の効果かを切り分ける）:
  seed       baseline + seed 固定
  schema     A/C と同じ出力形式だが、定義も例もない最小限のプロンプト（SCHEMA_PROMPT）
"""

CATEGORIES = ["時制", "主語と動詞の一致", "名詞の境界", "構文・語順"]


# ======================================================================
# baseline: app.py の analysis_prompt と同一（変更しないこと）
# ======================================================================

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


# ======================================================================
# A / C / schema で共通の部分（役割・出力のしかた・除外ルール）
# ======================================================================

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
  例: "I go... I went to the park." → go も went も数えない（同じ節のほかの箇所は通常どおり数える）。
- 単純な言い淀みや繰り返し（"I I love driving" など）、音声認識のノイズらしき箇所も数えない。
"""

SCHEMA_PROMPT = _ITEM_COMMON


# ======================================================================
# プロンプトA「定義の明文化（ルーブリック型）」
# キーポイント: 採点者によって「何を1件と数えるか」が変わることがぶれの原因だと考え、
#               数える単位・数えないもの・観点の優先順位をすべて書き出す。
# ======================================================================

RUBRIC_PROMPT = _ITEM_COMMON + """
【必須文脈の数え方（数える単位）】※この定義に厳密に従い、定義にない箇所は数えないこと
- 時制: 述語動詞（主語に対応する定形動詞。助動詞＋動詞は1つのまとまりとして扱う）1つにつき1件。
  to不定詞・動名詞・分詞の単独用法は数えない。話している内容の時間（過去・現在・未来・継続など）に合わない形なら誤り。
- 主語と動詞の一致: 人称・数で形が変わる述語動詞1つにつき1件。具体的には、一般動詞の現在形、be動詞（am/is/are/was/were）、
  have/has、do/does。一般動詞の過去形や助動詞（can, will など）の後の動詞は数えない。主語の人称・数と合っていなければ誤り。
  時制が誤っている述語動詞は「時制」にだけ記録し、ここでは数えない。
- 名詞の境界: 普通名詞を中心とする名詞句1つにつき1件。固有名詞・代名詞は数えない。
  冠詞（a/an/the）の有無・選択、または単数形・複数形が誤っていれば誤り。
- 構文・語順: 節（主語と述語動詞のまとまり）1つにつき1件。語順の崩れ、必須要素（主語・動詞・目的語など）の欠落、
  関係詞節などの構造の誤りがあれば誤り。

【1つの誤りは1観点だけ】
1つの誤りは、最もよく当てはまる1つの観点にだけ is_error=true として記録する
（例: 3単現の s の抜けは「主語と動詞の一致」のみ。「時制」の誤りにはしない）。
"""


# ======================================================================
# プロンプトB「手順の固定（節ごとのチェックリスト型）」
# キーポイント: 「どこから見て、何を確かめるか」を毎回同じ手順にすれば、拾い漏れや見る順番の違いによるぶれが減ると考え、
#               発話をまず節に分け、節ごとに決まった4つの質問に順番に答えさせる。
# ======================================================================

CLAUSE_PROMPT = """
あなたは第二言語習得（SLA）の専門家です。英語学習者の発話の書き起こしを、次の手順どおりに1つずつ確認してください。
手順を飛ばしたり、順番を変えたりしてはいけません。

【手順1：節に分ける】
- 問題番号の順に、各回答を節に分けて clauses に並べる。節＝主語と述語動詞（定形動詞）1つのまとまり。
- and / but などで述語動詞が2つ並んでいる場合は、別々の節にする（主語が省略されていても、述語動詞があれば1節）。
- 述語動詞のない断片（"Yes." "Soccer and tennis." など）も1節として並べ、skip=true にする。
- 言い淀み（uh, um）だけの部分や、単純な繰り返しは節にしない。

【手順2：言い直しの確認】
- 学習者が言い直した箇所（例: "He go... he goes to school"）は、言い直した後の形で節を作る。
- 言い直した要素に関わる観点は applicable=false にする（上の例では、go/goes の時制と一致は false）。
- 言い直しだけで節が成り立たない場合は skip=true にする。

【手順3：節ごとに、次の4つの質問に順番に答える】（skip=true の節は答えなくてよい。すべて applicable=false、noun_phrases は空にしておく）
- 質問1 tense（時制）: この節の述語動詞は、話している内容の時間（過去・現在・未来・継続など）に合った形か。
  述語動詞があれば applicable=true。合っていなければ is_error=true。
- 質問2 agreement（主語と動詞の一致）: 述語動詞は、一般動詞の現在形・be動詞（am/is/are/was/were）・have/has・do/does のどれかか。
  どれかなら applicable=true とし、主語の人称・数と合っていなければ is_error=true。
  一般動詞の過去形、助動詞（can, will など）の後の動詞、質問1で時制が誤りだった動詞は applicable=false。
- 質問3 noun_phrases（名詞の境界）: この節に含まれる普通名詞句をすべて noun_phrases に挙げ、
  冠詞（a/an/the）の有無・選択と単数形・複数形が正しいかを判定する。固有名詞・代名詞は挙げない。
- 質問4 syntax（構文・語順）: この節の語順・必須要素（主語・動詞・目的語など）・構造（関係詞節など）は正しいか。
  時制・一致・名詞の誤りはここに含めない。applicable は常に true。

【その他】
- 1つの誤りは、最もよく当てはまる1つの質問にだけ is_error=true として記録する。
- correction には、誤りの場合は正しい形を、正しい場合は空文字を入れる。
- text には節を元の発話のまま英語で書く。q には問題番号（例: "Q3"）を書く。
"""


# ======================================================================
# プロンプトC「採点例の提示（Few-shot 型）」
# キーポイント: 規則を文章で説明するより、採点済みの具体例を見せた方が数え方がそろうと考え、
#               定義は最小限（共通部分のみ）にして、言い直し・3単現・時制・冠詞・語順の判断を含む採点例を2つ示す。
# ======================================================================

FEWSHOT_PROMPT = _ITEM_COMMON + """
【採点例】以下の例と同じ考え方・同じ細かさで採点すること。

＜例1の入力＞
Q5: Tell me about what your best friend usually does on weekends.
回答: My friend usually play soccer in the park. He go... he goes to a café after that. He likes coffee very much.

＜例1の解説＞
- "play" は3単現の s が抜けている。誤りは「主語と動詞の一致」にだけ記録し、「時制」は正しいとする。
- "He go... he goes" は言い直しなので、go/goes の時制と一致は数えない。同じ節の "a café" と節の構文は数える。
- "that" は代名詞なので名詞の境界には数えない。"soccer" "coffee" は無冠詞で正しい。

＜例1の出力＞
{"items": [
 {"category": "時制", "q": "Q5", "quote": "My friend usually play", "is_error": false, "correction": ""},
 {"category": "主語と動詞の一致", "q": "Q5", "quote": "My friend usually play", "is_error": true, "correction": "My friend usually plays"},
 {"category": "名詞の境界", "q": "Q5", "quote": "My friend", "is_error": false, "correction": ""},
 {"category": "名詞の境界", "q": "Q5", "quote": "soccer", "is_error": false, "correction": ""},
 {"category": "名詞の境界", "q": "Q5", "quote": "the park", "is_error": false, "correction": ""},
 {"category": "構文・語順", "q": "Q5", "quote": "My friend usually play soccer in the park", "is_error": false, "correction": ""},
 {"category": "名詞の境界", "q": "Q5", "quote": "a café", "is_error": false, "correction": ""},
 {"category": "構文・語順", "q": "Q5", "quote": "he goes to a café after that", "is_error": false, "correction": ""},
 {"category": "時制", "q": "Q5", "quote": "He likes", "is_error": false, "correction": ""},
 {"category": "主語と動詞の一致", "q": "Q5", "quote": "He likes", "is_error": false, "correction": ""},
 {"category": "名詞の境界", "q": "Q5", "quote": "coffee", "is_error": false, "correction": ""},
 {"category": "構文・語順", "q": "Q5", "quote": "He likes coffee very much", "is_error": false, "correction": ""}
]}

＜例2の入力＞
Q6: What did you do last weekend? Please explain in detail.
回答: Last weekend I go to Shibuya with my sister. We watched movie. I very enjoyed it.

＜例2の解説＞
- "I go" は過去のことなので時制の誤り。時制が誤っている動詞は「主語と動詞の一致」には数えない。
- "watched" "enjoyed" は一般動詞の過去形なので「主語と動詞の一致」には数えない。
- "Shibuya" は固有名詞、"it" は代名詞なので名詞の境界には数えない。"movie" は冠詞が抜けている。
- "I very enjoyed it" は副詞の位置が誤っているので構文・語順の誤り。

＜例2の出力＞
{"items": [
 {"category": "名詞の境界", "q": "Q6", "quote": "Last weekend", "is_error": false, "correction": ""},
 {"category": "時制", "q": "Q6", "quote": "I go", "is_error": true, "correction": "I went"},
 {"category": "名詞の境界", "q": "Q6", "quote": "my sister", "is_error": false, "correction": ""},
 {"category": "構文・語順", "q": "Q6", "quote": "Last weekend I go to Shibuya with my sister", "is_error": false, "correction": ""},
 {"category": "時制", "q": "Q6", "quote": "We watched", "is_error": false, "correction": ""},
 {"category": "名詞の境界", "q": "Q6", "quote": "movie", "is_error": true, "correction": "a movie"},
 {"category": "構文・語順", "q": "Q6", "quote": "We watched movie", "is_error": false, "correction": ""},
 {"category": "時制", "q": "Q6", "quote": "I very enjoyed", "is_error": false, "correction": ""},
 {"category": "構文・語順", "q": "Q6", "quote": "I very enjoyed it", "is_error": true, "correction": "I enjoyed it very much"}
]}
"""


# ======================================================================
# 出力形式（OpenAI の Structured Outputs。strict=True でスキーマどおりの JSON しか返らない）
# ======================================================================

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

_CHECK = {
    "type": "object",
    "properties": {
        "applicable": {"type": "boolean"},
        "is_error": {"type": "boolean"},
        "correction": {"type": "string"},
    },
    "required": ["applicable", "is_error", "correction"],
    "additionalProperties": False,
}

CLAUSE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "clause_checklist",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "clauses": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "q": {"type": "string"},
                            "text": {"type": "string"},
                            "skip": {"type": "boolean"},
                            "tense": _CHECK,
                            "agreement": _CHECK,
                            "noun_phrases": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "quote": {"type": "string"},
                                        "is_error": {"type": "boolean"},
                                        "correction": {"type": "string"},
                                    },
                                    "required": ["quote", "is_error", "correction"],
                                    "additionalProperties": False,
                                },
                            },
                            "syntax": _CHECK,
                        },
                        "required": ["q", "text", "skip", "tense", "agreement", "noun_phrases", "syntax"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["clauses"],
            "additionalProperties": False,
        },
    },
}
