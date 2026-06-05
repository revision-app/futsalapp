# Vercel + Supabase 運用メモ

## 構成

- Vercel: Next.js App Router
- Supabase: Auth + Postgres
- Supabase Auth: ログインIDによるログイン、管理者作成、パスワード再設定
- Vercel Cron: 毎日 00:00 UTC / 09:00 JST に `/api/cron/reminders`
- SendGrid: イベントリマインドメールのみ任意

旧FastAPI実装は参照用に `legacy_fastapi/` へ退避しています。Vercelで動かす本体は `src/app` です。

## 初期セットアップ

1. Supabaseプロジェクトを作成する。
2. `supabase/migrations/001_initial_schema.sql` を Supabase SQL Editor で実行する。
3. `.env.example` を参考に `.env.local` を作成する。
4. `npm install` を実行する。
5. `npm run dev` で起動する。

## Supabase Auth設定

- Site URL: `NEXT_PUBLIC_SITE_URL` と同じURL
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://<your-vercel-domain>/auth/callback`

初期管理者は Supabase または管理用SQLで明示的に `admin` として作成します。初回登録ユーザーを自動的に `admin` にする仕様ではありません。以降の権限変更は `/admin/users` から行います。

ユーザーは `saitoy` のようなログインIDで管理します。Supabase Auth の内部識別子として `${login_id}@revision.local` を使いますが、メールアドレスとしては管理しません。

## Vercel環境変数

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `CRON_SECRET`
- `SENDGRID_API_KEY` optional
- `SENDGRID_FROM_EMAIL` optional

`CRON_SECRET` を設定すると、Vercel Cronの `Authorization: Bearer <CRON_SECRET>` 以外の呼び出しを拒否します。
