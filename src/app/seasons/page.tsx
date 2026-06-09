import Link from "next/link";
import { Download, Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatDateJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Season } from "@/lib/types";

export default async function SeasonsPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: seasons } = await supabase
    .from("seasons")
    .select("*")
    .order("start_date", { ascending: false });

  return (
    <AppShell profile={profile} active="seasons">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">シーズン</h1>
          <p className="text-sm text-slate-500">期間ごとの集計</p>
        </div>
        {profile.role === "admin" ? (
          <Link href="/seasons/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            新規
          </Link>
        ) : null}
      </div>

      <div className="space-y-3">
        {((seasons ?? []) as Season[]).length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">シーズンがありません。</div>
        ) : (
          ((seasons ?? []) as Season[]).map((season) => (
            <article className="card p-4" key={season.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-ink">{season.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDateJst(season.start_date)} - {formatDateJst(season.end_date)}
                  </p>
                </div>
                {profile.role === "admin" ? (
                  <Link href={`/seasons/${season.id}/edit`} className="btn-secondary px-3" title="編集" aria-label="編集">
                    <Pencil className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
              {profile.role === "admin" ? (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Link href={`/api/seasons/${season.id}/export/attendance`} className="btn-secondary">
                    <Download className="h-4 w-4" />
                    出欠CSV
                  </Link>
                  <Link href={`/api/seasons/${season.id}/export/matches`} className="btn-secondary">
                    <Download className="h-4 w-4" />
                    試合CSV
                  </Link>
                  <Link href={`/api/seasons/${season.id}/export/mvp`} className="btn-secondary">
                    <Download className="h-4 w-4" />
                    MVP CSV
                  </Link>
                  <Link href={`/api/seasons/${season.id}/export/awards`} className="btn-secondary">
                    <Download className="h-4 w-4" />
                    各賞CSV
                  </Link>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
