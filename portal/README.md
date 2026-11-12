# 自己管理ポータル

自分1人で使う自己管理用Webアプリ。仕様は [SPEC.md](./SPEC.md) を参照。

- Next.js（App Router）+ TypeScript + Tailwind CSS
- Supabase（PostgreSQL、Auth）
- Vercel にデプロイ（このリポジトリの `portal/` フォルダがアプリ本体）

## 実装状況

| フェーズ | 内容 | 状況 |
|---|---|---|
| 1 | 土台（ログイン、全テーブルとRLS、画面の枠、PWA） | 実装済み |
| 2 | タスク・メモ | 未着手 |
| 3 | 勤怠・勉強・練習スケジュール | 未着手 |
| 4 | お金 | 未着手 |
| 5 | 謎解きメモ・IELTS・ホームの仕上げ | 未着手 |

## セットアップ

### 1. Supabase

1. [Supabase](https://supabase.com/) で新しいプロジェクトを作る（無料プラン）
2. **SQL Editor** に [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) の中身を貼り付けて実行する（全テーブルとRow Level Securityが作られる）
3. 接続情報を控える
   - Project URL: **Project Settings → Data API**（または画面上部の「Connect」）に表示される `https://xxxx.supabase.co`
   - キー: **Project Settings → API Keys** の「Publishable key」（`sb_publishable_...`）。「Legacy API Keys」タブの「anon public」でもよい。`service_role` / Secret key は使わない
4. 左端のメインメニューの **Authentication**（Project Settingsの中ではない）→ **URL Configuration**
   - Site URL: 公開先のURL（例: `https://xxxx.vercel.app`）
   - Redirect URLs: `https://xxxx.vercel.app/auth/callback` と `http://localhost:3000/auth/callback` を追加
5. **Authentication → Emails → Magic Link** のテンプレート本文に `{{ .Token }}` を追加する（例: `コード: {{ .Token }}`）。
   ホーム画面に追加したPWAではメールのリンクが別のブラウザで開いてしまうため、メールに書かれたコードを入力してログインできるようにするためのもの。テンプレート内の「Confirm your signup」にも同じように入れておく（初回ログイン時はこちらが届く）

### 2. 環境変数

`.env.example` を `.env.local` にコピーして値を入れる（`.env.local` はGitに含めない）。

| 変数 | 内容 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | SupabaseのPublishable key（またはanon publicキー） |
| `ALLOWED_EMAIL` | ログインを許可する自分のメールアドレス。これ以外はアプリ側で弾く |
| `GOOGLE_CALENDAR_ICAL_URL` | Googleカレンダーの非公開iCal URL（フェーズ5で使用。サーバー側だけで使う） |

### 3. ローカルで動かす

```bash
npm install
```

```bash
npm run dev
```

`http://localhost:3000` を開き、`ALLOWED_EMAIL` のメールアドレスでログインする。

### 4. Vercel にデプロイ

1. Vercel で「Add New → Project」からこのGitHubリポジトリを選ぶ
2. **Root Directory** を `portal` に設定する（リポジトリ直下には別のアプリがあるため）
3. 上の環境変数4つを **Environment Variables** に登録する
4. デプロイ後、発行されたURLをSupabaseの Site URL / Redirect URLs に設定する（手順1-4）

以後は、Vercelで本番ブランチに設定したブランチへのpushで自動デプロイされる。

### 5. 初回ログイン後にやること

自分のアカウントでログインできたら、Supabaseの **Authentication → Sign In / Providers** で
「Allow new users to sign up」をオフにして、新規登録を無効にする。

### 6. スマホのホーム画面に追加（PWA）

- iPhone（Safari）: 共有ボタン →「ホーム画面に追加」
- Android（Chrome）: メニュー →「ホーム画面に追加」／「アプリをインストール」

ホーム画面から開いたあと、メールアドレスを入力し、届いたメールのコードを入力してログインする。

## データ保護の仕組み

- `src/proxy.ts`: すべてのページで、未ログインならログイン画面へ送り、`ALLOWED_EMAIL` 以外のアカウントはログアウトさせる
- すべてのテーブルに `user_id` があり、Row Level Security で本人の行だけ読み書きできる
- ログイン用メールは `ALLOWED_EMAIL` 宛てにしか送らない

## 開発用コマンド

```bash
npm run lint
```

```bash
npm run build
```
