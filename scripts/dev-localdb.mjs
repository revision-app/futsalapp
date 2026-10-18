// ローカルの Supabase（npm run db:start）に接続して開発サーバーを起動する。
// 環境変数は .env.local より優先されるので、本番DBには接続しない。
import { execSync, spawn } from "node:child_process";

let status;
try {
  status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.error("ローカルの Supabase が起動していません。先に `npm run db:start` を実行してください。");
  process.exit(1);
}

const local = {};
for (const line of status.split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (match) local[match[1]] = match[2];
}

if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(local.API_URL ?? "")) {
  console.error(`接続先がローカルではありません: ${local.API_URL}`);
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  SENDGRID_API_KEY: "",
};

console.log(`ローカルDB（${local.API_URL}）に接続して起動します。`);
const child = spawn("npx", ["next", "dev", "--webpack"], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
