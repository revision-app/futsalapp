import { execSync } from "node:child_process";

// DBテストはローカルの Supabase（`npm run db:start`）に対してだけ実行する。
// .env.local の本番接続先は使わず、`supabase status` の値で環境変数を上書きする。
function readLocalSupabaseEnv(): Record<string, string> {
  let output: string;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("ローカルの Supabase が起動していません。先に `npm run db:start` を実行してください。");
  }

  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const local = readLocalSupabaseEnv();
const url = local.API_URL;

if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(url)) {
  throw new Error(`DBテストの接続先がローカルではありません: ${url ?? "(なし)"}`);
}

process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = local.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = local.SERVICE_ROLE_KEY;
