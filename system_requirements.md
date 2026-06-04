# REVISION システム要件定義書

> 2026-05-28 更新: 現在の実装は Vercel + Supabase Auth/Postgres 前提の Next.js アプリへ移行済みです。新しい運用手順は `VERCEL_SUPABASE.md` を参照してください。以下は旧FastAPI/Railway構成の要件メモとして残しています。

---

## 1. システム概要

本システムは、フットサルチーム（アクティブ30人規模）の運営を効率化するWebアプリケーション **REVISION** です。出欠管理・MVP投票・シーズン集計を主要機能として提供します。スマートフォンでの閲覧に最適化し、Railway上にデプロイするPaaS構成を採用します。

---

## 2. 技術スタック

| カテゴリ | ライブラリ / サービス | 役割・選定理由 |
|----------|----------------------|----------------|
| バックエンド | Python 3.12 + FastAPI | Python製の軽量Webフレームワーク。非同期対応・自動ドキュメント生成あり |
| テンプレート | Jinja2 + HTMX | サーバーサイドレンダリング。JS最小限でSPA的UXを実現 |
| スタイリング | Tailwind CSS（Play CDN） | ユーティリティCSS。スマホ最適化レスポンシブ対応 |
| ORM / DB | SQLAlchemy（async） + PostgreSQL | 非同期対応ORM。asyncpgドライバ使用 |
| マイグレーション | Alembic | DBスキーマ変更の追跡・管理 |
| 認証 | FastAPI-Users 13.x | JWT Cookie認証・パスワードリセット・権限管理を提供 |
| メール送信 | SendGrid（無料枠） | 月最大100通。招待・リマインドメールをカバー |
| タスクスケジューラ | Railway Cron Job | 前日AM9:00のリマインドメール定期実行 |
| ホスティング | Railway | Git pushでデプロイ。PostgreSQL・Cron Jobも同一プラットフォームで管理 |
| バージョン管理 | GitHub | ソースコード管理・Railwayとの自動デプロイ連携 |

---

## 3. システムアーキテクチャ

### 3.1 全体構成

本システムはモノリシックなサーバーサイドレンダリング構成を採用します。フロントエンドとバックエンドを分離せず、FastAPIからJinja2テンプレートを直接レンダリングすることで、開発・運用コストを最小化します。

```
ブラウザ（スマホ最適化）
    ↓ HTTPS
FastAPI + Jinja2 + HTMX（Railway Web Service）
    ↓
PostgreSQL（Railway Managed DB）
    ↓
SendGrid（外部メールサービス）

Railway Cron Job → リマインドメール処理（毎日AM9:00 JST）
```

### 3.2 認証フロー

- **一般ユーザー**：登録ページでメールアドレス・表示名・パスワードを入力 → 登録後即ログイン → イベント一覧へ
- **管理ユーザー**：管理者がユーザー管理画面から一般ユーザー登録リンクをコピーして共有 → 登録後、管理者がユーザー管理画面で管理者権限を付与
- **パスワードリセット**：メールアドレス入力 → リセットリンク送信 → リンクから新パスワード設定
- **認証方式**：JWTトークン（HTTP-only Cookie保存）。`is_superuser` フラグに応じてアクセス制御
- **未ログインアクセス**：画面系URLは `/auth/login` へ自動リダイレクト（APIエンドポイントは 401 JSON）

### 3.3 タイムゾーン

- DBはUTCで保存
- フォーム入力値（datetime-local）はJST（+9:00）として受け取りUTCに変換して保存
- テンプレート表示時は `to_jst` フィルターでJSTに変換して表示
- イベント登録時刻は15分単位

---

## 4. ディレクトリ構成

```
project/
├── app/
│   ├── main.py               # FastAPIエントリーポイント・例外ハンドラー
│   ├── auth.py               # FastAPI-Users設定（JWT Cookie認証）
│   ├── config.py             # 環境変数管理（pydantic-settings）
│   ├── database.py           # 非同期SQLAlchemyエンジン
│   ├── templates_config.py   # Jinja2テンプレート共有インスタンス・フィルター定義
│   ├── routers/              # 機能別ルーター
│   │   ├── auth_pages.py     # 認証HTMLページ（登録・ログイン・リセット）
│   │   ├── events.py         # イベント・シーズン登録・管理・CSVエクスポート
│   │   ├── attendance.py     # 出欠登録・管理（HTMX対応）
│   │   ├── mvp.py            # MVP投票・集計
│   │   └── admin.py          # 管理者機能（ユーザー管理・招待）
│   ├── models/               # SQLAlchemyモデル定義
│   │   ├── user.py
│   │   ├── season.py
│   │   ├── event.py
│   │   ├── attendance.py
│   │   └── mvp_vote.py
│   ├── schemas/              # Pydanticスキーマ（バリデーション）
│   ├── services/             # ビジネスロジック
│   │   ├── email.py          # メール送信（SendGrid）
│   │   ├── reminder.py       # リマインド処理（Cron Job用）
│   │   └── csv_export.py     # CSV生成（出欠・MVP）
│   ├── templates/            # Jinja2 HTMLテンプレート
│   │   ├── base.html         # 共通レイアウト（ナビ・ヘッダー）
│   │   ├── auth/             # ログイン・登録・パスワードリセット
│   │   ├── events/           # イベント一覧・詳細・作成編集
│   │   ├── seasons/          # シーズン一覧・作成編集
│   │   ├── mvp/              # MVP投票・結果
│   │   ├── admin/            # 管理ダッシュボード・ユーザー管理・招待
│   │   └── partials/         # HTMXレスポンス用HTMLフラグメント
│   └── static/               # 静的ファイル
├── seed.py                   # デバッグ用サンプルデータ投入スクリプト
├── tests/                    # ユニット・統合テスト
├── alembic/                  # DBマイグレーション
├── railway.toml              # Railway設定ファイル
├── Procfile                  # プロセス定義
├── requirements.txt          # Pythonパッケージ一覧
└── .env                      # 環境変数（ローカル開発用、.gitignore対象）
```

---

## 5. データベース設計

### users（ユーザー情報）

| カラム名 | 型 | 説明 |
|----------|----|------|
| id | UUID | 主キー |
| email | VARCHAR | メールアドレス（一意） |
| hashed_password | VARCHAR | ハッシュ化パスワード（bcrypt） |
| display_name | VARCHAR(100) | 表示名 |
| is_superuser | BOOLEAN | 管理ユーザーフラグ（= is_admin） |
| is_active | BOOLEAN | 有効フラグ（利用停止で False） |
| is_verified | BOOLEAN | メール確認済みフラグ（現在は未強制） |
| created_at | TIMESTAMP | 登録日時 |

### seasons（シーズン情報）

| カラム名 | 型 | 説明 |
|----------|----|------|
| id | UUID | 主キー |
| name | VARCHAR | シーズン名 |
| start_date | DATE | 開始日 |
| end_date | DATE | 終了日 |
| created_by | UUID (FK) | 作成した管理ユーザー |
| created_at | TIMESTAMP | 作成日時 |

### events（活動予定）

| カラム名 | 型 | 説明 |
|----------|----|------|
| id | UUID | 主キー |
| season_id | UUID (FK) | 所属シーズン |
| title | VARCHAR(200) | タイトル |
| event_type | ENUM | 種別（practice / match / party） |
| location | VARCHAR(200) | 場所 |
| event_date | TIMESTAMP(UTC) | 活動日時（UTC保存・JST表示） |
| created_by | UUID (FK) | 作成した管理ユーザー |
| created_at | TIMESTAMP | 作成日時 |

### attendances（出欠情報）

| カラム名 | 型 | 説明 |
|----------|----|------|
| id | UUID | 主キー |
| event_id | UUID (FK) | 活動予定 |
| user_id | UUID (FK) | ユーザー |
| status | ENUM | 出欠ステータス（attending / absent / pending） |
| updated_at | TIMESTAMP | 最終更新日時 |

> ※ イベント作成時に全アクティブユーザー分の出欠レコードを `pending` で自動生成する。

### mvp_votes（MVP投票）

| カラム名 | 型 | 説明 |
|----------|----|------|
| id | UUID | 主キー |
| event_id | UUID (FK) | 活動予定 |
| voter_id | UUID (FK) | 投票者 |
| votee_id | UUID (FK) | 投票先ユーザー（自分自身への投票も可） |
| created_at | TIMESTAMP | 投票日時 |

> ※ 1ユーザー1イベント1票（再投票で上書き可能）。

---

## 6. 機能仕様

### 6.1 画面・機能一覧

| 画面 | URL | 権限 | 主な機能 |
|------|-----|------|---------|
| ログイン | `/auth/login` | 全員 | メール・パスワードでログイン |
| ユーザー登録 | `/auth/register` | 全員 | 表示名・メール・パスワードで登録 |
| パスワードリセット | `/auth/forgot-password` | 全員 | リセットメール送信 |
| イベント一覧 | `/events` | ログイン済 | シーズン絞り込み・自分の出欠状況表示 |
| イベント詳細 | `/events/{id}` | ログイン済 | 出欠登録（HTMX）・MVP投票リンク・参加者一覧 |
| イベント作成・編集 | `/events/new` `/events/{id}/edit` | 管理者 | 15分単位の時刻入力 |
| シーズン一覧 | `/seasons` | ログイン済 | CSVエクスポート（管理者のみ） |
| MVP投票 | `/mvp/{id}` | ログイン済 | 参加者への投票（自分自身への投票も可） |
| MVP結果 | `/mvp/{id}/results` | 管理者 | 得票数ランキング表示 |
| 管理ダッシュボード | `/admin/dashboard` | 管理者 | 統計・各機能へのショートカット |
| ユーザー管理 | `/admin/users` | 管理者 | 管理者権限付与・利用停止/再開・招待リンクコピー |
| 管理者招待 | `/admin/invite` | 管理者 | 管理者用招待メール送信 |

### 6.2 出欠管理

- イベント詳細ページで「参加」「欠席」「未回答」の3択ボタンをHTMXで即時更新
- イベント作成時に全アクティブユーザーの出欠レコードを `pending` で自動生成

### 6.3 MVP投票

- 対象イベント種別：practice（練習）・match（試合）
- 参加ステータスが `attending` のユーザーのみ投票候補に表示
- 自分自身への投票も可能
- 1ユーザー1票（再投票で変更可能）
- 結果表示は管理者のみ（一般ユーザーには「結果を見る」ボタン非表示）

### 6.4 CSVエクスポート

- 出欠CSV：シーズン内の全イベント × 全ユーザーのクロス集計
- MVP CSV：シーズン内の各イベントの得票1位まとめ
- 文字コード：UTF-8 BOM付き（Excelで直接開ける）

---

## 7. 環境変数

| 変数名 | 説明 |
|--------|------|
| DATABASE_URL | PostgreSQL接続URL（RailwayがDATABASE_URLとして自動注入） |
| SECRET_KEY | JWTトークン署名用シークレットキー |
| SENDGRID_API_KEY | SendGrid APIキー（未設定時はコンソールにログ出力） |
| SENDGRID_FROM_EMAIL | 送信元メールアドレス |
| ADMIN_INVITE_SECRET | 管理ユーザー招待トークン生成用シークレット兼Cron Job認証キー |
| BASE_URL | アプリのベースURL（メール内リンク生成用） |

---

## 8. デプロイ手順（Railway）

| 手順 | 内容 |
|------|------|
| 1. GitHubリポジトリ作成 | アプリコードをpush |
| 2. Railwayプロジェクト作成 | railway.app にてNew Project → Deploy from GitHub |
| 3. PostgreSQL追加 | Railway管理画面 → Add Service → PostgreSQL（DATABASE_URLが自動設定） |
| 4. 環境変数設定 | Railway管理画面 → Variables にて上記環境変数を登録 |
| 5. Cron Job設定 | Railway管理画面 → Add Service → Cron（`0 0 * * *` = 毎日AM9:00 JST） |
| 6. デプロイ確認 | Deployments タブでビルドログ・稼働状況を確認 |

> ※ デプロイ時に `alembic upgrade head` が自動実行されます（`railway.toml` に設定済み）。
> ※ Cron JobはPOST `/cron/reminders` を `X-Cron-Secret` ヘッダー付きでリクエストします。

---

## 9. 開発環境セットアップ（Windows）

### 9.1 必要ツール

- Python 3.12（[python.org](https://python.org) からインストール）
- Git（[git-scm.com](https://git-scm.com) からインストール）
- VS Code（推奨エディタ）
- PostgreSQL（ローカルDB用）

### 9.2 初期セットアップ手順

```bash
# リポジトリをクローン
git clone <repository_url>
cd <project_directory>

# 仮想環境作成・有効化
python -m venv venv
.\venv\Scripts\activate

# パッケージインストール
pip install -r requirements.txt

# .envファイルをプロジェクトルートに作成し環境変数を設定
copy .env.example .env
# .env を編集して DATABASE_URL 等を設定

# DBマイグレーション実行
alembic upgrade head

# サンプルデータ投入（任意）
python seed.py

# ローカル起動
uvicorn app.main:app --reload
```

ブラウザで `http://localhost:8000` にアクセスして動作確認します。

seed.py 実行後のログインアカウント（パスワード共通: `password123`）：

| メールアドレス | 権限 |
|---------------|------|
| admin@revision.local | 管理者 |
| tanaka@revision.local〜kobayashi@revision.local | 一般 |

---

## 10. 非機能要件への対応方針

### 10.1 セキュリティ

- パスワードはbcryptでハッシュ化して保存
- JWTトークンはHTTP-only Cookieで管理（XSS対策）
- 未ログインアクセスは `/auth/login` へ自動リダイレクト
- 全環境変数はRailway Variablesで管理し、コードへのハードコード禁止
- Cron JobエンドポイントはX-Cron-Secretヘッダーで保護

### 10.2 可用性

- Railway Webサービスは自動再起動・ヘルスチェック機能あり（`/health` エンドポイント）
- 30人規模の同時アクセスはRailway Hobbyプランで十分対応可能
- PostgreSQLは自動バックアップ（Railway標準機能）

### 10.3 保守性

- GitHub連携による自動デプロイ（mainブランチへのpushで即時反映）
- Railway管理画面でログ・リソース使用状況を確認可能
- Alembicによるマイグレーション管理でDBスキーマ変更を追跡
