import { completeInitialSetupAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/Notice";

type InitialSetupPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function InitialSetupPage({ searchParams }: InitialSetupPageProps) {
  const profile = await requireUser({ allowPasswordSetup: true });
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink">初回設定</h1>
          <p className="mt-1 text-sm text-slate-500">{profile.display_name || profile.email} さんの設定</p>
        </div>
        <div className="card space-y-4 p-6">
          <Notice error={params?.error} />
          <form action={completeInitialSetupAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">新しいパスワード</label>
              <input className="form-input" type="password" name="password" minLength={8} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">新しいパスワード（確認）</label>
              <input className="form-input" type="password" name="password_confirm" minLength={8} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">復旧用の質問</label>
              <input
                className="form-input"
                type="text"
                name="recovery_question"
                placeholder="例: 初めて所属したチーム名は？"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">復旧用の答え</label>
              <input className="form-input" type="text" name="recovery_answer" autoComplete="off" required />
              <p className="mt-1 text-xs text-slate-500">
                他人が調べにくく、自分だけが思い出せる答えにしてください。
              </p>
            </div>
            <button type="submit" className="btn-primary w-full">
              設定を完了する
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
