# テストとローカルDB

## 前提

- `.env.local` は**本番の Supabase** につながっている。`npm run dev` で動作確認すると、本番のデータを読み書きする。
- 試合記録や成績の動作確認、DBのテストは、下の**ローカルの Supabase** で行う。

## コマンド

| コマンド | 内容 | 必要なもの |
|---|---|---|
| `npm test` | 計算ロジックのテスト（`src/**/*.test.ts`） | なし |
| `npm run db:start` | ローカルの Supabase を起動し、`supabase/migrations/` を全部適用する | Docker Desktop |
| `npm run test:db` | ローカルDBに対するテスト（`tests/db/`）。マイグレーション・制約・権限（RLS）・シーズン成績の集計を確認する | `db:start` 済み |
| `npm run dev:localdb` | ローカルDBにつないで開発サーバーを起動する（本番DBにはつながない） | `db:start` 済み |
| `npm run db:reset` | ローカルDBを空にして、マイグレーションを最初から適用し直す | `db:start` 済み |
| `npm run db:stop` | ローカルの Supabase を止める | |
| `npm run db:status` | ローカルの Supabase のURLやキーを表示する | |

ローカルの管理画面（Supabase Studio）は http://127.0.0.1:54323 で開ける。

## 安全装置

- `test:db` と `dev:localdb` は、接続先が `127.0.0.1` / `localhost` でなければエラーで止まる。
- `test:db` は、テストのたびに専用のユーザーとシーズンを作り、終わったら消す。

## マイグレーションを追加するとき

1. `supabase/migrations/` に連番でSQLを追加する（例: `020_...sql`）。
2. `npm run db:reset` でローカルに最初から適用し、エラーが出ないことを確認する。
3. `npm run test:db` を実行する。
4. 本番には、バックアップを取ってから手で適用する（[REMAINING_ITEMS.md](REMAINING_ITEMS.md) の手順）。

## Windows で Docker Desktop が起動しないとき

`initializing Inference manager` や `initializing Secrets Engine` のあとに `The file cannot be accessed by the system` と出て止まる場合は、前回の古いソケットファイルが消せずに残っている。Docker Desktop を終了してから、次のフォルダの名前を変えて退避し、Docker Desktop を起動し直す（Docker がフォルダを作り直す）。

- `%LOCALAPPDATA%\Docker\run`
- `%LOCALAPPDATA%\docker-secrets-engine`
