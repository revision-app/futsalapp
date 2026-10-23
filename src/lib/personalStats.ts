import { getProfileDisplayName } from "@/lib/profile";
import type { SeasonUserStats } from "@/lib/seasonMatchStats";

export type RankedStat = {
  rank: number;
  stats: SeasonUserStats;
  value: number;
};

/** 試合に出た（または参加した）記録がある選手。表では、これ以外は「-」で表示する */
export function hasSeasonRecord(row: SeasonUserStats): boolean {
  return row.games > 0 || row.attendanceDays > 0;
}

/**
 * ランキング。同じ値は同じ順位にし、表示順は背番号の昇順を第2キーにする。
 * include で対象を絞る（例: キーパーは GK をした人だけ）。
 */
export function rankStats(
  rows: SeasonUserStats[],
  getValue: (row: SeasonUserStats) => number,
  options: { ascending?: boolean; include?: (row: SeasonUserStats) => boolean } = {}
): RankedStat[] {
  const include = options.include ?? ((row: SeasonUserStats) => row.games > 0);
  const sorted = rows
    .filter(include)
    .map((stats) => ({ stats, value: getValue(stats) }))
    .sort(
      (a, b) =>
        (options.ascending ? a.value - b.value : b.value - a.value) ||
        (a.stats.user.uniform_no ?? 9999) - (b.stats.user.uniform_no ?? 9999) ||
        getProfileDisplayName(a.stats.user).localeCompare(getProfileDisplayName(b.stats.user))
    );

  let previous: number | null = null;
  let previousRank = 0;
  return sorted.map((item, index) => {
    const rank = previous === item.value ? previousRank : index + 1;
    previous = item.value;
    previousRank = rank;
    return { rank, ...item };
  });
}

/** 割合（%）。分母が0なら「-」 */
export function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** 1試合あたりなどの平均。分母が0なら「-」 */
export function formatAverage(numerator: number, denominator: number, digits = 2): string {
  if (denominator === 0) return "-";
  return (numerator / denominator).toFixed(digits);
}
