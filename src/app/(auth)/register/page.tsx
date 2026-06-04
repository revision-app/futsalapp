import { Notice } from "@/components/Notice";
import Link from "next/link";

type RegisterPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink">アカウント登録</h1>
          <p className="mt-1 text-sm text-slate-500">アカウント作成は管理者が行います</p>
        </div>
        <div className="card space-y-4 p-6">
          <Notice error={params?.error} message={params?.message} />
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            現在、利用者自身での登録は停止しています。管理者がアカウントを作成し、一時パスワードを案内します。
          </div>
          <div className="text-center text-sm">
            <Link href="/login" className="text-slate-500 hover:underline">
              ログインに戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
