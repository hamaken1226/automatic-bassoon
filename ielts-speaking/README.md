# IELTS Speaking 練習ツール

録音 → 文字起こし(Whisper)→ Pythonで指標を計算 → AIで添削、を1回数分で回すためのローカルツール。
12/11 の本番までの期間限定。

## セットアップ(Windows・初回だけ)

PowerShell でこのフォルダ(`ielts-speaking`)に移動して:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

`.env` をメモ帳で開き、`OPENAI_API_KEY=` に自分のキーを入れる(`.env` は `.gitignore` 済みでGitに入らない)。

## 起動

- `start.bat` をダブルクリック(ブラウザで http://localhost:8000 が開く)
- またはターミナルで `python app.py` を実行して http://localhost:8000 を開く

初回はChromeがマイクの使用許可を聞いてくるので「許可」する。

## 使い方

1. Partを選ぶ → 質問が出る(「別の質問」で引き直し)
2. Part1/3は「録音開始」、Part2は「準備開始(1分)」→ メモを書く → 0秒で自動的に録音が始まる
3. 「停止して採点」で終了(Part1は60秒、Part2は2分ちょうど、Part3は90秒で自動停止)
4. 10〜30秒で結果画面が出る
5. 次の練習を始めるとき、画面上部の「前回の『次回意識する1点』」を読んでから始める

## ファイル

| ファイル | 中身 |
|---|---|
| `app.py` | FastAPI本体・エンドポイント |
| `metrics.py` | WPM・沈黙・フィラー・繰り返し語・語彙の多様さの計算(AIには数えさせない) |
| `wordlists.py` | フィラー辞書・ストップワード(ここに足せば数え方が変わる) |
| `feedback.py` | Whisperでの文字起こし、AI評価のプロンプトとJSON Schema、費用の目安計算 |
| `questions.json` | 質問(Part1×20、Part2キューカード×10、Part3×30) |
| `static/index.html` | 画面(練習・結果・履歴) |
| `data/sessions/` | 練習ごとの `日時_partN.webm`(音声)と `.json`(質問・文字起こし・指標・AI評価・トークン数・費用) |

モデルや料金の設定は `.env` で変えられる(`OPENAI_MODEL` など。`.env.example` 参照)。

## 完成の確認(要件定義12章)

- [ ] Part1・2・3を1回ずつ通しで実行して、結果画面まで表示される
- [ ] わざと "um" "uh" "maybe" を混ぜて話し、文字起こしに残って数えられている(結果画面の「今回の数字」と黄色のハイライト)
- [ ] Part2が2分ちょうどで自動停止する
- [ ] 1回あたりの費用が数円に収まっている(結果画面の一番下と履歴画面の「費用」列)
- [ ] `git status` で `.env` が出てこない

## 注意

- 目安バンドはAIの推定で、ブレがある。追うべき数字はPythonで出した指標(フィラー・沈黙・WPM・繰り返し)
- 発音は評価しない(italkiで見てもらう)
- Whisperは "um" などを省くことがある。プロンプトで残すよう誘導しているが、実際より少なく数えられる可能性はある
- 沈黙はWhisperの単語タイムスタンプから計算しているので、±0.数秒の誤差はある
