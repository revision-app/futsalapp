import { NextResponse } from "next/server";
import { csvEscape } from "@/lib/dates";
import { getCurrentProfile } from "@/lib/auth";
import { getProfileDisplayName } from "@/lib/profile";
import {
  getSeasonMatchStats,
  statAverage,
  type SeasonUserStats,
} from "@/lib/seasonMatchStats";

type RouteContext = {
  params: Promise<{ seasonId: string }>;
};

type RankRow = {
  rank: number;
  name: string;
  value: string;
};

function uniformNo(row: SeasonUserStats): number {
  return row.user.uniform_no ?? 9999;
}

function rankBy(
  rows: SeasonUserStats[],
  getValue: (row: SeasonUserStats) => number,
  options?: { ascending?: boolean; minValue?: number }
): RankRow[] {
  const minValue = options?.minValue ?? 0;
  const sorted = rows
    .filter((row) => getValue(row) > minValue)
    .sort((a, b) => {
      const valueDiff = options?.ascending ? getValue(a) - getValue(b) : getValue(b) - getValue(a);
      return valueDiff || uniformNo(a) - uniformNo(b) || getProfileDisplayName(a.user).localeCompare(getProfileDisplayName(b.user));
    });

  let previousValue: number | null = null;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const value = getValue(row);
    const rank = previousValue === value ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return {
      rank,
      name: getProfileDisplayName(row.user),
      value: String(value),
    };
  });
}

function rankMvp(rows: Array<{ user: SeasonUserStats["user"]; total: number; votes: number }>): RankRow[] {
  let previousValue: number | null = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = previousValue === row.total ? previousRank : index + 1;
    previousValue = row.total;
    previousRank = rank;
    return { rank, name: getProfileDisplayName(row.user), value: String(row.total) };
  });
}

function sectionRows(title: string, headers: string[], rows: string[][]): string[][] {
  return [[title], headers, ...rows, []];
}

function topName(rows: RankRow[], rank = 1): string {
  return rows.find((row) => row.rank === rank)?.name ?? "";
}

function allTopNames(rows: RankRow[], rank = 1): string {
  return rows.filter((row) => row.rank === rank).map((row) => row.name).join(" / ");
}

export async function GET(_request: Request, context: RouteContext) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const { seasonId } = await context.params;
  const { stats, mvpTotals } = await getSeasonMatchStats(seasonId);

  const mvpRanking = rankMvp(mvpTotals);
  const goalRanking = rankBy(stats, (row) => row.goals);
  const assistRanking = rankBy(stats, (row) => row.assists);
  const keeperRanking = rankBy(
    stats,
    (row) => (row.gkGames >= 20 ? row.gkGoalsAgainst / row.gkGames : Number.POSITIVE_INFINITY),
    { ascending: true, minValue: -1 }
  ).filter((row) => row.value !== "Infinity");
  const pointsRanking = rankBy(stats, (row) => row.points);
  const goalDiffRanking = rankBy(stats, (row) => row.teamGoalsFor - row.teamGoalsAgainst);
  const averagePointsRanking = rankBy(stats, (row) => (row.games > 0 ? Number(statAverage(row.points, row.games, 3)) : 0));
  const goalPointRanking = rankBy(stats, (row) => row.goalGames.size);
  const assistPointRanking = rankBy(stats, (row) => row.assistGames.size);
  const attendanceRanking = rankBy(stats, (row) => row.attendanceDays);

  const rows: string[][] = [
    ...sectionRows(
      "MVP結果",
      ["順位", "名前", "得票数"],
      mvpRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "ゴールランキング",
      ["順位", "名前", "ゴール数"],
      goalRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "アシストランキング",
      ["順位", "名前", "アシスト数"],
      assistRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "キーパーランキング(規定回数20回)",
      ["順位", "名前", "セーブ率", "GK時失点", "GK回数"],
      keeperRanking.map((row) => {
        const stat = stats.find((item) => getProfileDisplayName(item.user) === row.name);
        return [String(row.rank), row.name, row.value, String(stat?.gkGoalsAgainst ?? ""), String(stat?.gkGames ?? "")];
      })
    ),
    ...sectionRows(
      "勝ち点",
      ["順位", "名前", "勝ち点"],
      pointsRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "得失点",
      ["順位", "名前", "得失点"],
      goalDiffRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "平均勝ち点",
      ["順位", "名前", "平均勝ち点"],
      averagePointsRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "Gぽいん",
      ["順位", "名前", "Gぽいん"],
      goalPointRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "Aぽいん",
      ["順位", "名前", "Aぽいん"],
      assistPointRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "一番参加したで賞",
      ["順位", "名前", "参加日数"],
      attendanceRanking.map((row) => [String(row.rank), row.name, row.value])
    ),
    ...sectionRows(
      "受賞候補",
      ["賞", "対象者"],
      [
        ["ゴールデンボール賞", topName(mvpRanking, 1)],
        ["シルバーボール賞", topName(mvpRanking, 2)],
        ["ブロンズボール賞", topName(mvpRanking, 3)],
        ["得点王", topName(goalRanking, 1)],
        ["アシスト王", topName(assistRanking, 1)],
        ["キーパー王", topName(keeperRanking, 1)],
        ["勝ち点", topName(pointsRanking, 1)],
        ["得失点", topName(goalDiffRanking, 1)],
        ["平均勝ち点", topName(averagePointsRanking, 1)],
        ["Gぽいん", allTopNames(goalPointRanking, 1)],
        ["Aぽいん", allTopNames(assistPointRanking, 1)],
        ["一番参加したで賞", allTopNames(attendanceRanking, 1)],
        ["50代でよく頑張ってるで賞", ""],
      ]
    ),
  ];

  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="awards_${seasonId}.csv"`,
    },
  });
}
