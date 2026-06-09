import { NextResponse } from "next/server";
import { csvEscape } from "@/lib/dates";
import { getCurrentProfile } from "@/lib/auth";
import { getProfileDisplayName, getProfileLoginId } from "@/lib/profile";
import { getSeasonMatchStats, sortStatsByUser, statAverage, statRatio } from "@/lib/seasonMatchStats";

type RouteContext = {
  params: Promise<{ seasonId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const { seasonId } = await context.params;
  const { events, stats } = await getSeasonMatchStats(seasonId);

  const headers = [
    "ユーザー名",
    "ログインID",
    "背番号",
    "参加日数",
    "参加率",
    "試合数",
    "勝ち",
    "負け",
    "引分け",
    "勝率",
    "負け率",
    "ゴール数",
    "アシスト数",
    "Gぽいん",
    "Aぽいん",
    "GK回数",
    "GK時失点",
    "セーブ率",
    "チーム得点",
    "チーム失点",
    "得失点",
    "1試合あたり総得点",
    "1試合あたり総失点",
    "勝ち点",
    "平均勝ち点",
  ];

  const rows = [
    headers,
    ...sortStatsByUser(stats).map((row) => [
      getProfileDisplayName(row.user),
      getProfileLoginId(row.user),
      String(row.user.uniform_no ?? ""),
      String(row.attendanceDays),
      statRatio(row.attendanceDays, events.length),
      String(row.games),
      String(row.wins),
      String(row.losses),
      String(row.draws),
      statRatio(row.wins, row.games),
      statRatio(row.losses, row.games),
      String(row.goals),
      String(row.assists),
      String(row.goalGames.size),
      String(row.assistGames.size),
      String(row.gkGames),
      String(row.gkGoalsAgainst),
      statAverage(row.gkGoalsAgainst, row.gkGames),
      String(row.teamGoalsFor),
      String(row.teamGoalsAgainst),
      String(row.teamGoalsFor - row.teamGoalsAgainst),
      statAverage(row.teamGoalsFor, row.games),
      statAverage(row.teamGoalsAgainst, row.games),
      String(row.points),
      statAverage(row.points, row.games),
    ]),
  ];

  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="matches_${seasonId}.csv"`,
    },
  });
}
