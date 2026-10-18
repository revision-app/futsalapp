import { describe, expect, it } from "vitest";
import {
  checkSessionSheet,
  computeSessionStats,
  describeSheetProblems,
  getGameScore,
  getOpponentTeam,
  sheetCheckInputFromRows,
  type MatchPlayer,
  type SheetCheckInput,
} from "@/lib/matchStats";
import { statAverage, statRatio } from "@/lib/seasonMatchStats";
import type { MatchGame, MatchSession, MatchTeam, Profile } from "@/lib/types";

const TS = "2026-01-01T00:00:00Z";

function profile(id: string, uniformNo: number): Profile {
  return {
    id,
    email: `${id}@revision.local`,
    display_name: id,
    member_no: null,
    uniform_no: uniformNo,
    reading: null,
    login_id: id,
    role: "member",
    is_active: true,
    must_change_password: false,
    recovery_question: null,
    recovery_answer_salt: null,
    recovery_answer_hash: null,
    created_at: TS,
    updated_at: TS,
  };
}

function member(id: string, team: MatchTeam, uniformNo: number, goals = 0, assists = 0): MatchPlayer {
  return {
    id: `sp-${id}`,
    session_id: "s1",
    user_id: id,
    guest_id: null,
    team,
    goals,
    assists,
    created_at: TS,
    participant: { kind: "member", id, profile: profile(id, uniformNo) },
  };
}

function guest(id: string, team: MatchTeam, goals = 0, assists = 0): MatchPlayer {
  return {
    id: `sp-${id}`,
    session_id: "s1",
    user_id: null,
    guest_id: id,
    team,
    goals,
    assists,
    created_at: TS,
    participant: {
      kind: "guest",
      id,
      guest: { id, event_id: "e1", display_name: id, created_by: "admin", created_at: TS, updated_at: TS },
    },
  };
}

function game(
  id: string,
  gameNo: number,
  score: [number | null, number | null],
  gks: Partial<MatchGame> = {},
  teams: [MatchTeam, MatchTeam] = ["rev1", "rev2"]
): MatchGame {
  return {
    id,
    session_id: "s1",
    game_no: gameNo,
    team_a: teams[0],
    team_b: teams[1],
    score_a: score[0],
    score_b: score[1],
    rev1_gk_id: null,
    rev2_gk_id: null,
    rev3_gk_id: null,
    rev1_gk_guest_id: null,
    rev2_gk_guest_id: null,
    rev3_gk_guest_id: null,
    created_at: TS,
    updated_at: TS,
    ...gks,
  };
}

function session(teamCount: 2 | 3, ownGoals: Partial<Record<MatchTeam, number>> = {}): MatchSession {
  return {
    id: "s1",
    event_id: "e1",
    session_no: 1,
    team_count: teamCount,
    status: "draft",
    created_by: "admin",
    confirmed_by: null,
    confirmed_at: null,
    rev1_opponent_own_goals: ownGoals.rev1 ?? 0,
    rev2_opponent_own_goals: ownGoals.rev2 ?? 0,
    rev3_opponent_own_goals: ownGoals.rev3 ?? 0,
    revision: 0,
    updated_by: null,
    created_at: TS,
    updated_at: TS,
  };
}

function byName(rows: ReturnType<typeof computeSessionStats>) {
  return Object.fromEntries(rows.map((row) => [row.participant.id, row]));
}

describe("getGameScore", () => {
  it("returns the stored score of each team", () => {
    expect(getGameScore(game("g1", 1, [3, 1]))).toEqual({ gameId: "g1", rev1: 3, rev2: 1, rev3: 0 });
    expect(getGameScore(game("g2", 2, [2, 4], {}, ["rev3", "rev1"]))).toEqual({ gameId: "g2", rev1: 4, rev2: 0, rev3: 2 });
  });
});

describe("getOpponentTeam", () => {
  it("returns the other team, or null for a team not in the game", () => {
    const g = game("g1", 1, [0, 0], {}, ["rev1", "rev3"]);
    expect(getOpponentTeam(g, "rev1")).toBe("rev3");
    expect(getOpponentTeam(g, "rev3")).toBe("rev1");
    expect(getOpponentTeam(g, "rev2")).toBeNull();
  });
});

describe("computeSessionStats（スコアを直接保存した場合）", () => {
  // REV1: a(GK in g1), b(GK in g3), guest x(GK in g2) / REV2: c(GK in g1,g2), d(GK in g3)
  // ゴール・アシストはセッション合計。REV1 の得点 2 のうち 0、REV2 の得点 4 のうち 1 が相手OG
  const players = [
    member("a", "rev1", 7, 0, 1),
    member("b", "rev1", 3, 2, 0),
    guest("x", "rev1"),
    member("c", "rev2", 9, 1, 1),
    member("d", "rev2", 2, 2, 1),
  ];
  const games = [
    game("g1", 1, [2, 1], { rev1_gk_id: "a", rev2_gk_id: "c" }),
    game("g2", 2, [0, 0], { rev1_gk_guest_id: "x", rev2_gk_id: "c" }),
    game("g3", 3, [0, 3], { rev1_gk_id: "b", rev2_gk_id: "d" }),
  ];
  const rows = byName(computeSessionStats(players, games));

  it("counts games, wins, draws, losses and points from the stored scores (win 3 / draw 1)", () => {
    expect(rows.a).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, points: 4 });
    expect(rows.c).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, points: 4 });
  });

  it("uses the session totals for goals and assists", () => {
    expect(rows.b).toMatchObject({ goals: 2, assists: 0 });
    expect(rows.d).toMatchObject({ goals: 2, assists: 1 });
    expect(rows.c).toMatchObject({ goals: 1, assists: 1 });
  });

  it("separates GK goals against from team goals against", () => {
    // c kept goal in g1 (conceded 2) and g2 (conceded 0)
    expect(rows.c).toMatchObject({ gkGames: 2, gkGoalsAgainst: 2, teamGoalsFor: 4, teamGoalsAgainst: 2, goalDiff: 2 });
    // b kept goal in g3 (conceded 3)
    expect(rows.b).toMatchObject({ gkGames: 1, gkGoalsAgainst: 3, teamGoalsFor: 2, teamGoalsAgainst: 4, goalDiff: -2 });
    // guest GK is credited too
    expect(rows.x).toMatchObject({ gkGames: 1, gkGoalsAgainst: 0 });
  });

  it("no longer reports Gぽいん/Aぽいん", () => {
    expect(rows.d).not.toHaveProperty("goalGames");
    expect(rows.d).not.toHaveProperty("assistGames");
  });

  it("skips games whose score has not been entered yet", () => {
    const withDraft = byName(computeSessionStats(players, [...games, game("g4", 4, [1, null], { rev1_gk_id: "a", rev2_gk_id: "d" })]));
    expect(withDraft.a).toMatchObject({ games: 3, gkGames: 1 });
  });

  it("does not credit a GK who is not on that team", () => {
    const wrongGk = byName(computeSessionStats(players, [game("g1", 1, [1, 0], { rev1_gk_id: "c", rev2_gk_id: "d" })]));
    expect(wrongGk.c).toMatchObject({ gkGames: 0 });
  });

  it("orders rows by team, then uniform number", () => {
    const order = computeSessionStats(players, games).map((row) => row.participant.id);
    expect(order).toEqual(["b", "a", "x", "d", "c"]);
  });
});

describe("相手OGの集計", () => {
  // REV1 は 3 点取ったが、1 点は REV2 のオウンゴール
  const players = [member("a", "rev1", 1, 2), member("b", "rev2", 2, 1)];
  const games = [game("g1", 1, [3, 1], { rev1_gk_id: "a", rev2_gk_id: "b" })];
  const s = session(2, { rev1: 1 });

  it("counts toward the team's goals in the consistency check", () => {
    const result = checkSessionSheet(sheetCheckInputFromRows(s, players, games));
    expect(result.teamTotals.rev1).toEqual({ scoreTotal: 3, goalTotal: 3 });
    expect(result.goalMismatches).toEqual([]);
  });

  it("is not counted without the OG row", () => {
    const result = checkSessionSheet(sheetCheckInputFromRows(session(2), players, games));
    expect(result.goalMismatches).toEqual([{ team: "rev1", scoreTotal: 3, goalTotal: 2 }]);
  });

  it("counts in the team score but never appears as a player", () => {
    const rows = computeSessionStats(players, games);
    expect(rows).toHaveLength(2);
    expect(byName(rows).a).toMatchObject({ goals: 2, teamGoalsFor: 3, wins: 1 });
    expect(byName(rows).b).toMatchObject({ goals: 1, teamGoalsAgainst: 3, gkGoalsAgainst: 3, losses: 1 });
  });
});

describe("checkSessionSheet（確定できる条件）", () => {
  function input(overrides: Partial<SheetCheckInput> = {}): SheetCheckInput {
    return {
      teams: ["rev1", "rev2"],
      players: [
        { key: "member:a", team: "rev1", goals: 2 },
        { key: "member:b", team: "rev1", goals: 0 },
        { key: "member:c", team: "rev2", goals: 1 },
      ],
      ownGoals: { rev1: 1, rev2: 0 },
      games: [
        { gameNo: 1, teamA: "rev1", teamB: "rev2", scoreA: 2, scoreB: 1, gkA: "member:b", gkB: "member:c" },
        { gameNo: 2, teamA: "rev1", teamB: "rev2", scoreA: 1, scoreB: 0, gkA: "member:a", gkB: "member:c" },
      ],
      ...overrides,
    };
  }

  it("can be confirmed when scores, goals (incl. OG), GKs and scores are all complete", () => {
    const result = checkSessionSheet(input());
    expect(result.canConfirm).toBe(true);
    expect(describeSheetProblems(result)).toEqual([]);
  });

  it("cannot be confirmed when score totals and goal totals differ, and says by how much", () => {
    const result = checkSessionSheet(input({ ownGoals: { rev1: 0, rev2: 0 } }));
    expect(result.canConfirm).toBe(false);
    expect(describeSheetProblems(result)).toEqual(["REV1: スコア合計 3 / ゴール合計 2"]);
  });

  it("cannot be confirmed while a GK is missing", () => {
    const games = input().games.map((game) => (game.gameNo === 2 ? { ...game, gkB: null } : game));
    const result = checkSessionSheet(input({ games }));
    expect(result.canConfirm).toBe(false);
    expect(result.missingGks).toEqual([{ gameNo: 2, team: "rev2" }]);
    expect(describeSheetProblems(result)).toEqual(["GK未入力: 第2試合 REV2"]);
  });

  it("cannot be confirmed when the GK is not on that team", () => {
    const games = input().games.map((game) => (game.gameNo === 1 ? { ...game, gkA: "member:c" } : game));
    const result = checkSessionSheet(input({ games }));
    expect(result.canConfirm).toBe(false);
    expect(result.invalidGks).toEqual([{ gameNo: 1, team: "rev1" }]);
  });

  it("cannot be confirmed while a score is missing (blank is not 0)", () => {
    const games = input().games.map((game) => (game.gameNo === 2 ? { ...game, scoreB: null } : game));
    const result = checkSessionSheet(input({ games }));
    expect(result.canConfirm).toBe(false);
    expect(result.missingScores).toEqual([{ gameNo: 2, team: "rev2" }]);
    expect(result.goalMismatches).toEqual([]);
  });

  it("cannot be confirmed without players or games", () => {
    expect(checkSessionSheet(input({ games: [] })).canConfirm).toBe(false);
    expect(checkSessionSheet(input({ players: [], games: [] })).canConfirm).toBe(false);
  });
});

describe("3チーム戦", () => {
  const players = [member("a", "rev1", 1, 1), member("b", "rev2", 2, 1), member("c", "rev3", 3, 2)];
  const games = [
    game("g1", 1, [1, 0], { rev1_gk_id: "a", rev2_gk_id: "b" }, ["rev1", "rev2"]),
    game("g2", 2, [1, 1], { rev2_gk_id: "b", rev3_gk_id: "c" }, ["rev2", "rev3"]),
    game("g3", 3, [1, 0], { rev3_gk_id: "c", rev1_gk_id: "a" }, ["rev3", "rev1"]),
  ];
  const rows = byName(computeSessionStats(players, games));

  it("only counts games the player's team actually played", () => {
    expect(rows.a).toMatchObject({ games: 2, wins: 1, losses: 1, points: 3, gkGames: 2, gkGoalsAgainst: 1 });
    expect(rows.b).toMatchObject({ games: 2, losses: 1, draws: 1, points: 1, gkGames: 2, gkGoalsAgainst: 2 });
    expect(rows.c).toMatchObject({ games: 2, wins: 1, draws: 1, points: 4, gkGames: 2, gkGoalsAgainst: 1 });
  });

  it("checks goals per team against the games that team played", () => {
    const result = checkSessionSheet(sheetCheckInputFromRows(session(3), players, games));
    expect(result.teamTotals.rev1).toEqual({ scoreTotal: 1, goalTotal: 1 });
    expect(result.teamTotals.rev2).toEqual({ scoreTotal: 1, goalTotal: 1 });
    expect(result.teamTotals.rev3).toEqual({ scoreTotal: 2, goalTotal: 2 });
    expect(result.canConfirm).toBe(true);
  });

  it("reports only the team whose totals differ", () => {
    const fewer = [players[0], players[1], member("c", "rev3", 3, 1)];
    const result = checkSessionSheet(sheetCheckInputFromRows(session(3), fewer, games));
    expect(describeSheetProblems(result)).toEqual(["REV3: スコア合計 2 / ゴール合計 1"]);
  });
});

describe("statRatio / statAverage", () => {
  it("formats ratios and returns '-' when dividing by zero", () => {
    expect(statRatio(1, 3)).toBe("0.333");
    expect(statAverage(7, 2)).toBe("3.50");
    expect(statRatio(1, 0)).toBe("-");
    expect(statAverage(0, 0)).toBe("-");
  });
});
