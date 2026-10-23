import { describe, expect, it } from "vitest";
import { formatAverage, formatPercent, hasSeasonRecord, rankStats } from "@/lib/personalStats";
import type { SeasonUserStats } from "@/lib/seasonMatchStats";
import type { Profile } from "@/lib/types";

const TS = "2026-01-01T00:00:00Z";

function row(id: string, uniformNo: number | null, values: Partial<SeasonUserStats> = {}): SeasonUserStats {
  const user: Profile = {
    id,
    email: `${id}@revision.local`,
    display_name: id,
    member_no: null,
    uniform_no: uniformNo,
    reading: null,
    login_id: id,
    post: null,
    role: "member",
    is_active: true,
    must_change_password: false,
    recovery_question: null,
    recovery_answer_salt: null,
    recovery_answer_hash: null,
    created_at: TS,
    updated_at: TS,
  };
  return {
    user,
    attendanceDays: 0,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    goals: 0,
    assists: 0,
    goalDays: new Set(),
    assistDays: new Set(),
    gkGames: 0,
    gkGoalsAgainst: 0,
    teamGoalsFor: 0,
    teamGoalsAgainst: 0,
    ...values,
  };
}

describe("rankStats", () => {
  const rows = [
    row("a", 20, { games: 10, goals: 5 }),
    row("b", 8, { games: 10, goals: 9 }),
    row("c", 3, { games: 10, goals: 5 }),
    row("d", 40, { games: 4, goals: 0 }),
    row("e", 35), // 試合に出ていない
  ];

  it("orders by value, gives ties the same rank, and breaks ties by uniform number", () => {
    const ranked = rankStats(rows, (r) => r.goals).map((r) => [r.stats.user.id, r.rank]);
    expect(ranked).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 2],
      ["d", 4],
    ]);
  });

  it("leaves out players who have not played, but keeps players with 0", () => {
    const ids = rankStats(rows, (r) => r.goals).map((r) => r.stats.user.id);
    expect(ids).toContain("d");
    expect(ids).not.toContain("e");
  });

  it("ranks keepers by save rate ascending, only those who kept goal", () => {
    const keepers = [
      row("a", 1, { games: 10, gkGames: 4, gkGoalsAgainst: 2 }), // 0.50
      row("b", 2, { games: 10, gkGames: 3, gkGoalsAgainst: 2 }), // 0.67
      row("c", 3, { games: 10, gkGames: 0 }),
      row("d", 4, { games: 10, gkGames: 1, gkGoalsAgainst: 0 }), // 0.00
    ];
    const ranked = rankStats(keepers, (r) => r.gkGoalsAgainst / r.gkGames, { ascending: true, include: (r) => r.gkGames > 0 });
    expect(ranked.map((r) => [r.stats.user.id, r.rank])).toEqual([
      ["d", 1],
      ["a", 2],
      ["b", 3],
    ]);
  });
});

describe("hasSeasonRecord", () => {
  it("is true for players who attended or played", () => {
    expect(hasSeasonRecord(row("a", 1, { attendanceDays: 1 }))).toBe(true);
    expect(hasSeasonRecord(row("a", 1, { games: 2 }))).toBe(true);
    expect(hasSeasonRecord(row("a", 1))).toBe(false);
  });
});

describe("formatPercent / formatAverage", () => {
  it("formats like the paper summary, with '-' when dividing by zero", () => {
    expect(formatPercent(9, 18)).toBe("50.0%");
    expect(formatPercent(22, 88)).toBe("25.0%");
    expect(formatPercent(1, 0)).toBe("-");
    expect(formatAverage(45, 33)).toBe("1.36");
    expect(formatAverage(1, 0)).toBe("-");
  });
});
