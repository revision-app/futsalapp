import { NextResponse } from "next/server";
import { csvEscape, formatDateJst } from "@/lib/dates";
import { getCurrentProfile } from "@/lib/auth";
import { getProfileDisplayName } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Event, MvpVote, Profile } from "@/lib/types";

type RouteContext = {
  params: Promise<{ seasonId: string }>;
};

type VoteWithVotee = MvpVote & { votee: Profile | null };

export async function GET(_request: Request, context: RouteContext) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const { seasonId } = await context.params;
  const admin = createAdminClient();
  const { data: events } = await admin
    .from("events")
    .select("*")
    .eq("season_id", seasonId)
    .order("event_date", { ascending: true });

  const eventRows = (events ?? []) as Event[];
  const eventIds = eventRows.map((event) => event.id);

  let voteRows: VoteWithVotee[] = [];
  if (eventIds.length > 0) {
    const { data } = await admin
      .from("mvp_votes")
      .select("*, votee:profiles!mvp_votes_votee_id_fkey(*)")
      .in("event_id", eventIds);
    voteRows = (data ?? []) as VoteWithVotee[];
  }

  const rows = [["イベント日", "タイトル", "MVP", "合計ポイント", "投票数"]];

  for (const event of eventRows) {
    const totals = new Map<string, { user: Profile; total: number; votes: number }>();
    for (const vote of voteRows.filter((row) => row.event_id === event.id)) {
      if (!vote.votee) continue;
      const row = totals.get(vote.votee_id) ?? { user: vote.votee, total: 0, votes: 0 };
      row.total += vote.points;
      row.votes += 1;
      totals.set(vote.votee_id, row);
    }

    const winner = [...totals.values()].sort((a, b) => b.total - a.total || b.votes - a.votes)[0];
    rows.push([
      formatDateJst(event.event_date),
      event.title,
      winner ? getProfileDisplayName(winner.user) : "投票なし",
      String(winner?.total ?? 0),
      String(winner?.votes ?? 0),
    ]);
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mvp_${seasonId}.csv"`,
    },
  });
}
