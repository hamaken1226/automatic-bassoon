# 自己管理ポータル

自分1人で使う自己管理用Webアプリ。仕様は [SPEC.md](./SPEC.md) を参照。

- Next.js（App Router）+ TypeScript + Tailwind CSS
- Supabase（PostgreSQL、Auth）
- Vercel にデプロイ（このリポジトリの `portal/` フォルダがアプリ本体）

## 実装状況

| フェーズ | 内容 | 状況 |
|---|---|---|
| 1 | 土台（ログイン、全テーブルとRLS、画面の枠、PWA） | 実装済み |
| 2 | タスク・メモ | 実装済み |
| 3 | 勤怠・勉強・練習スケジュール | 実装済み |
| 4 | お金 | 実装済み |
| 5 | 謎解きメモ・IELTS・ホームの仕上げ | 実装済み（Speakingツールの結果の取り込みだけ未対応） |

## セットアップ

公開先のURLはVercelにデプロイしたときに発行されるので、
「Supabaseの準備 → Vercelにデプロイ → SupabaseにURLを登録」の順に進める。

### 1. Supabaseの準備

1. [Supabase](https://supabase.com/) で新しいプロジェクトを作る（無料プラン）
2. **SQL Editor** で、[`supabase/migrations/`](./supabase/migrations/) のSQLを番号順に1つずつ貼り付けて実行する
   - `0001_init.sql`: 全テーブルとRow Level Security
   - `0002_money.sql`: お金の機能の追加（貸しの回収、クレカの照合日など）

   あとからSQLファイルが増えたときは、新しいものだけを実行する（実行済みのものをもう一度実行するとエラーになるが、データは壊れない）
3. 接続情報を控える
   - Project URL: **Project Settings → Data API**（または画面上部の「Connect」）に表示される `https://xxxx.supabase.co`
   - キー: **Project Settings → API Keys** の「Publishable key」（`sb_publishable_...`）。「Legacy API Keys」タブの「anon public」でもよい。`service_role` / Secret key は使わない

### 2. Vercel にデプロイ

1. Vercel で「Add New → Project」からこのGitHubリポジトリを選ぶ
2. **Root Directory** を `portal` に設定する（リポジトリ直下には別のアプリがあるため）
3. **Environment Variables** に次を登録する

   | 変数 | 内容 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | SupabaseのPublishable key（またはanon publicキー） |
   | `ALLOWED_EMAIL` | ログインを許可する自分のメールアドレス。これ以外はアプリ側で弾く |
   | `GOOGLE_CALENDAR_ICAL_URL` | Googleカレンダーの「iCal形式の非公開URL」（ホームの予定カードで使用。下の「Googleカレンダーの連携」参照） |

4. デプロイする。完了すると公開先のURL（`https://プロジェクト名.vercel.app`）が発行される。
   プロジェクトページの「Domains」に出る短いURLが本番用（デプロイごとに出る長いURLではない）

Vercelは本番ブランチ（初期設定は `main`）をデプロイする。`portal/` が本番ブランチに入っていないと
「Root Directory が見つからない」と失敗するので、先にマージしておく。
以後は、本番ブランチへのpushで自動デプロイされる。

### 3. Supabaseに公開先のURLを登録

左端のメインメニューの **Authentication**（Project Settingsの中ではない）で設定する。

1. **URL Configuration**
   - Site URL: 手順2で発行されたURL（例: `https://xxxx.vercel.app`）
   - Redirect URLs: `https://xxxx.vercel.app/auth/callback` を追加（ローカルでも動かすなら `http://localhost:3000/auth/callback` も）
2. （任意・後回しでよい）**Emails → Magic Link** のテンプレートに `{{ .Token }}`（ログイン用コード）を追加する。
   SupabaseではカスタムSMTP（自前のメール送信設定）を設定しないとテンプレートを編集できないので、最初は飛ばしてよい。
   コードが無くても、PCのブラウザやスマホのSafari／Chromeではメールのリンクでログインできる。
   iPhoneのホーム画面アプリでログインできないときだけ、カスタムSMTPを設定して追加する（手順5参照）

### 4. ログインして、新規登録を無効にする

1. 公開先のURLを開き、`ALLOWED_EMAIL` のメールアドレスでログインする
2. ログインできたら、Supabaseの **Authentication → Sign In / Providers** で
   「Allow new users to sign up」をオフにして、新規登録を無効にする

### Googleカレンダーの連携

1. PCのブラウザでGoogleカレンダーを開き、右上の歯車 →「設定」
2. 左の「マイカレンダーの設定」から表示したいカレンダーを選ぶ
3. 「カレンダーの統合」にある **「iCal 形式の非公開URL」** をコピーする（`https://calendar.google.com/calendar/ical/.../private-.../basic.ics`）
4. Vercelの環境変数 `GOOGLE_CALENDAR_ICAL_URL` に登録して、デプロイし直す

このURLを知っている人は誰でも予定を見られるので、他の場所には貼らない。アプリではサーバー側だけで使い、ブラウザには渡さない。
取得結果は15分ほどキャッシュするので、カレンダーの変更がホームに出るまで少しかかる。

### 5. スマホのホーム画面に追加（PWA）

- iPhone（Safari）: 共有ボタン →「ホーム画面に追加」
- Android（Chrome）: メニュー →「ホーム画面に追加」／「アプリをインストール」

- Androidはブラウザとログイン状態を共有するので、Chromeでログインしていればそのまま使える
- iPhoneは、先にSafariでログインしてから「ホーム画面に追加」する。ホーム画面から開いてログイン画面が出る場合は、
  メールのリンクがSafari側で開いてしまいホーム画面アプリに戻れないため、手順3-2（ログイン用コード）が必要

### ローカルで動かす場合（任意）

`.env.example` を `.env.local` にコピーして、手順2と同じ値を入れる（`.env.local` はGitに含めない）。

```bash
npm install
```

```bash
npm run dev
```

`http://localhost:3000` を開いてログインする。

## データ保護の仕組み

- `src/proxy.ts`: すべてのページで、未ログインならログイン画面へ送り、`ALLOWED_EMAIL` 以外のアカウントはログアウトさせる
- すべてのテーブルに `user_id` があり、Row Level Security で本人の行だけ読み書きできる
- ログイン用メールは `ALLOWED_EMAIL` 宛てにしか送らない

## 開発用コマンド

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```
