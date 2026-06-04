import { AppShell } from "@/components/AppShell";
import { updateSeasonAction } from "@/lib/actions/seasons";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Season } from "@/lib/types";

type EditSeasonPageProps = {
  params: Promise<{ seasonId: string }>;
};

export default async function EditSeasonPage({ params }: EditSeasonPageProps) {
  const { seasonId } = await params;
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data: season } = await supabase.from("seasons").select("*").eq("id", seasonId).single();

  if (!season) {
    return (
      <AppShell profile={profile} active="seasons">
        <div className="card p-6 text-sm text-slate-500">シーズンが見つかりません。</div>
      </AppShell>
    );
  }

  const row = season as Season;

  return (
    <AppShell profile={profile} active="seasons">
      <h1 className="mb-4 text-xl font-bold text-ink">シーズン編集</h1>
      <form action={updateSeasonAction} className="card space-y-4 p-4">
        <input type="hidden" name="season_id" value={row.id} />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">シーズン名</label>
          <input name="name" defaultValue={row.name} className="form-input" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">開始日</label>
          <input name="start_date" type="date" defaultValue={row.start_date} className="form-input" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">終了日</label>
          <input name="end_date" type="date" defaultValue={row.end_date} className="form-input" required />
        </div>
        <button type="submit" className="btn-primary w-full">
          更新する
        </button>
      </form>
    </AppShell>
  );
}
