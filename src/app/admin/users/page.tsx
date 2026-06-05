import { Shield, UserCheck, UserX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { updateUserActiveAction, updateUserRoleAction } from "@/lib/actions/admin";
import { requireAdmin } from "@/lib/auth";
import { getProfileDisplayName, getProfileLoginId } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export default async function AdminUsersPage() {
  const profile = await requireAdmin();
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <AppShell profile={profile} active="admin">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">ユーザー管理</h1>
        <p className="text-sm text-slate-500">権限と有効状態</p>
      </div>

      <div className="space-y-3">
        {((users ?? []) as Profile[]).map((user) => {
          const loginId = getProfileLoginId(user);
          return (
            <article className="card p-4" key={user.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-ink">{getProfileDisplayName(user)}</h2>
                  <p className="truncate text-sm text-slate-500">ログインID: {loginId}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {[
                      user.member_no ? `No.${user.member_no}` : null,
                      user.uniform_no ? `背番号 ${user.uniform_no}` : null,
                      user.reading,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.role === "admin" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>
                    {user.role === "admin" ? "管理者" : "一般"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${user.is_active ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>
                    {user.is_active ? "有効" : "無効"}
                  </span>
                  {user.must_change_password ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">
                      初回設定待ち
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <form action={updateUserRoleAction}>
                  <input type="hidden" name="user_id" value={user.id} />
                  <input type="hidden" name="role" value={user.role === "admin" ? "member" : "admin"} />
                  <button className="btn-secondary w-full" type="submit" disabled={user.id === profile.id}>
                    <Shield className="h-4 w-4" />
                    {user.role === "admin" ? "一般へ" : "管理者へ"}
                  </button>
                </form>
                <form action={updateUserActiveAction}>
                  <input type="hidden" name="user_id" value={user.id} />
                  <input type="hidden" name="is_active" value={String(!user.is_active)} />
                  <button className="btn-secondary w-full" type="submit" disabled={user.id === profile.id}>
                    {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    {user.is_active ? "無効化" : "有効化"}
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
