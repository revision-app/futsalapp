import Link from "next/link";
import { findRecoveryQuestionAction, resetPasswordWithRecoveryAction } from "@/lib/actions/auth";
import { Notice } from "@/components/Notice";
import { createAdminClient } from "@/lib/supabase/admin";

type ForgotPasswordPageProps = {
  searchParams?: Promise<{ email?: string; error?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const email = params?.email ?? "";
  let question = "";

  if (email) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("recovery_question")
      .eq("email", email)
      .maybeSingle();
    question = data?.recovery_question ?? "";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink">パスワード再設定</h1>
          <p className="mt-1 text-sm text-slate-500">メールを使わず、復旧用の答えで再設定します</p>
        </div>
        <div className="card space-y-4 p-6">
          <Notice error={params?.error} />
          {!email ? (
            <form action={findRecoveryQuestionAction} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">メールアドレス</label>
                <input className="form-input" type="email" name="email" autoComplete="email" required />
              </div>
              <button type="submit" className="btn-primary w-full">
                復旧用の質問を確認する
              </button>
            </form>
          ) : (
            <form action={resetPasswordWithRecoveryAction} className="space-y-4">
              <input type="hidden" name="email" value={email} />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">復旧用の質問</label>
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-ink">{question || "未設定"}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">答え</label>
                <input className="form-input" type="text" name="recovery_answer" autoComplete="off" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">新しいパスワード</label>
                <input className="form-input" type="password" name="password" minLength={8} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">新しいパスワード（確認）</label>
                <input className="form-input" type="password" name="password_confirm" minLength={8} required />
              </div>
              <button type="submit" className="btn-primary w-full">
                パスワードを更新する
              </button>
            </form>
          )}
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
