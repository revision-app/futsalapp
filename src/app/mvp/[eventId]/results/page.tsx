import Link from "next/link";
import { Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { formatDateTimeJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Event, MvpVote, Profile } from "@/lib/types";

type VoteWithVotee = MvpVote & { votee: Profile | null };

type MvpResultsPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function MvpResultsPage({ params }: MvpResultsPageProps) {
  const { eventId } = await params;
  const profile = await requireUser();
  const supabase = await createClient();

  const [{ data: event }, { data: votes }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase
      .from("mvp_votes")
      .select("*, votee:profiles!mvp_votes_votee_id_fkey(*)")
      .eq("event_id", eventId),
  ]);

  if (!event) {
    return (
      <AppShell profile={profile} active="mvp">
        <div className="card p-6 text-sm text-slate-500">イベントが見つかりません。</div>
      </AppShell>
    );
  }

  const totals = new Map<
    string,
    { user: Profile; total: number; pt3: number; pt2: number; pt1: number }
  >();
  const voterIds = new Set<string>();

  for (const vote of (votes ?? []) as VoteWithVotee[]) {
    if (!vote.votee) continue;
    voterIds.add(vote.voter_id);
    const row =
      totals.get(vote.votee_id) ??
      ({ user: vote.votee, total: 0, pt3: 0, pt2: 0, pt1: 0 } satisfies {
        user: Profile;
        total: number;
        pt3: number;
        pt2: number;
        pt1: number;
      });
    row.total += vote.points;
    if (vote.points === 3) row.pt3 += 1;
    if (vote.points === 2) row.pt2 += 1;
    if (vote.points === 1) row.pt1 += 1;
    totals.set(vote.votee_id, row);
  }

  const ranked = [...totals.values()].sort((a, b) => b.total - a.total || b.pt3 - a.pt3 || b.pt2 - a.pt2);
  const eventRow = event as Event;

  return (
    <AppShell profile={profile} active="mvp">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <EventTypeBadge type={eventRow.event_type} />
          <span className="text-sm text-slate-500">{formatDateTimeJst(eventRow.event_date)}</span>
        </div>
        <h1 className="text-xl font-bold text-ink">MVP結果</h1>
        <p className="mt-1 text-sm text-slate-500">
          {eventRow.title} / 投票者 {voterIds.size}人
        </p>
      </div>

      <div className="space-y-3">
        {ranked.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">まだ投票がありません。</div>
        ) : (
          ranked.map((row, index) => (
            <article className="card flex items-center gap-3 p-4" key={row.user.id}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light font-bold text-primary">
                {index === 0 ? <Trophy className="h-5 w-5" /> : index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold text-ink">{row.user.display_name || row.user.email}</h2>
                <p className="text-sm text-slate-500">
                  3pt: {row.pt3} / 2pt: {row.pt2} / 1pt: {row.pt1}
                </p>
              </div>
              <div className="text-xl font-bold text-primary">{row.total}</div>
            </article>
          ))
        )}
      </div>

      <Link href={`/mvp/${eventId}`} className="btn-secondary mt-4 w-full">
        投票へ戻る
      </Link>
    </AppShell>
  );
}
