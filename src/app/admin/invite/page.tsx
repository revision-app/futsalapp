import { UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Notice } from "@/components/Notice";
import { createUserAction } from "@/lib/actions/admin";
import { requireAdmin } from "@/lib/auth";

type InvitePageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function AdminInvitePage({ searchParams }: InvitePageProps) {
  const profile = await requireAdmin();
  const params = await searchParams;

  return (
    <AppShell profile={profile} active="admin">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">ユーザー作成</h1>
        <p className="text-sm text-slate-500">初期パスワード password123 で作成します</p>
      </div>

      <div className="card space-y-4 p-4">
        <Notice error={params?.error} message={params?.message} />
        <form action={createUserAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">表示名</label>
            <input className="form-input" type="text" name="display_name" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">ログインID</label>
            <input className="form-input" type="text" name="login_id" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">権限</label>
            <select className="form-input" name="role" defaultValue="member">
              <option value="member">一般</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            本人へ初期パスワードを別手段で伝えてください。初回ログイン後に変更させます。
          </p>
          <button type="submit" className="btn-primary w-full">
            <UserPlus className="h-4 w-4" />
            作成する
          </button>
        </form>
      </div>
    </AppShell>
  );
}
