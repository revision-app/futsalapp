import { updatePasswordAction } from "@/lib/actions/auth";
import { Notice } from "@/components/Notice";

type ResetPasswordPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink">新しいパスワード</h1>
        </div>
        <div className="card space-y-4 p-6">
          <Notice error={params?.error} />
          <form action={updatePasswordAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">パスワード</label>
              <input className="form-input" type="password" name="password" minLength={8} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">パスワード（確認）</label>
              <input className="form-input" type="password" name="password_confirm" minLength={8} required />
            </div>
            <button type="submit" className="btn-primary w-full">
              更新する
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
