import Link from "next/link";
import { CalendarDays, Layers3, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminDashboardPage() {
  const profile = await requireAdmin();
  const admin = createAdminClient();

  const [users, events, seasons] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("events").select("id", { count: "exact", head: true }),
    admin.from("seasons").select("id", { count: "exact", head: true }),
  ]);

  return (
    <AppShell profile={profile} active="admin">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">管理</h1>
        <p className="text-sm text-slate-500">ユーザーと運用設定</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard icon={<Users className="h-5 w-5" />} label="有効ユーザー" value={users.count ?? 0} />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="イベント" value={events.count ?? 0} />
        <MetricCard icon={<Layers3 className="h-5 w-5" />} label="シーズン" value={seasons.count ?? 0} />
      </div>

      <div className="mt-5 grid gap-3">
        <Link href="/admin/users" className="card flex items-center justify-between p-4 transition hover:border-primary">
          <span className="font-semibold text-ink">ユーザー管理</span>
          <Users className="h-5 w-5 text-slate-400" />
        </Link>
        <Link href="/admin/invite" className="card flex items-center justify-between p-4 transition hover:border-primary">
          <span className="font-semibold text-ink">ユーザー作成</span>
          <UserPlus className="h-5 w-5 text-slate-400" />
        </Link>
      </div>
    </AppShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="card p-4">
      <div className="mb-2 text-primary">{icon}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
