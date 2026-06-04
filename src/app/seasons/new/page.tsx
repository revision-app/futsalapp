import { AppShell } from "@/components/AppShell";
import { createSeasonAction } from "@/lib/actions/seasons";
import { requireAdmin } from "@/lib/auth";

export default async function NewSeasonPage() {
  const profile = await requireAdmin();

  return (
    <AppShell profile={profile} active="seasons">
      <h1 className="mb-4 text-xl font-bold text-ink">シーズン作成</h1>
      <form action={createSeasonAction} className="card space-y-4 p-4">
        <SeasonFields />
        <button type="submit" className="btn-primary w-full">
          作成する
        </button>
      </form>
    </AppShell>
  );
}

function SeasonFields() {
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">シーズン名</label>
        <input name="name" className="form-input" required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">開始日</label>
        <input name="start_date" type="date" className="form-input" required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">終了日</label>
        <input name="end_date" type="date" className="form-input" required />
      </div>
    </>
  );
}
