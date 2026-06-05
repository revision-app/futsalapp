import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { Notice } from "@/components/Notice";

type LoginPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <AuthFrame title="REVISION" subtitle="チームの活動管理">
      <Notice error={params?.error} message={params?.message} />
      <form action={loginAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">ログインID</label>
          <input className="form-input" type="text" name="login_id" autoComplete="username" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">パスワード</label>
          <input className="form-input" type="password" name="password" autoComplete="current-password" required />
        </div>
        <button type="submit" className="btn-primary w-full">
          ログイン
        </button>
      </form>
      <div className="mt-4 flex flex-col gap-2 text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          パスワードを忘れた方
        </Link>
        <p className="text-slate-500">アカウント作成は管理者に依頼してください</p>
      </div>
    </AuthFrame>
  );
}

function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="card space-y-4 p-6">{children}</div>
      </div>
    </main>
  );
}
