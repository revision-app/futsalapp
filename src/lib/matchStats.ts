import { getProfileDisplayName } from "@/lib/profile";
import type { EventGuest, MatchGame, MatchSession, MatchSessionPlayer, MatchTeam, Profile } from "@/lib/types";

type OwnGoalColumn = `${MatchTeam}_opponent_own_goals`;

export type MatchParticipant =
  | { kind: "member"; id: string; profile: Profile }
  | { kind: "guest"; id: string; guest: EventGuest };

export type MatchPlayer = MatchSessionPlayer & { participant: MatchParticipant };

export type GameScore = {
  gameId: string;
  rev1: number;
  rev2: number;
  rev3: number;
};

export type SessionPlayerStats = {
  participant: MatchParticipant;
  team: MatchTeam;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  goals: number;
  assists: number;
  gkGames: number;
  gkGoalsAgainst: number;
  teamGoalsFor: number;
  teamGoalsAgainst: number;
  goalDiff: number;
};

export function participantKey(participant: MatchParticipant): string {
  return `${participant.kind}:${participant.id}`;
}

export function memberKey(id: string): string {
  return `member:${id}`;
}

export function guestKey(id: string): string {
  return `guest:${id}`;
}

export function matchPlayerKey(player: MatchPlayer): string {
  return player.user_id ? memberKey(player.user_id) : guestKey(player.guest_id ?? "");
}

export function getParticipantDisplayName(participant: MatchParticipant): string {
  return participant.kind === "member"
    ? getProfileDisplayName(participant.profile)
    : `${participant.guest.display_name}（ゲスト）`;
}

export function getParticipantUniformNo(participant: MatchParticipant): number | null {
  return participant.kind === "member" ? participant.profile.uniform_no : null;
}

export function compareParticipants(a: MatchParticipant, b: MatchParticipant): number {
  return (
    (getParticipantUniformNo(a) ?? 9999) - (getParticipantUniformNo(b) ?? 9999) ||
    getParticipantDisplayName(a).localeCompare(getParticipantDisplayName(b))
  );
}

export const MATCH_TEAMS: MatchTeam[] = ["rev1", "rev2", "rev3"];

export const TEAM_LABELS: Record<MatchTeam, string> = {
  rev1: "REV1",
  rev2: "REV2",
  rev3: "REV3",
};

export function getSessionTeams(session: { team_count: number }): MatchTeam[] {
  return session.team_count === 3 ? MATCH_TEAMS : ["rev1", "rev2"];
}

export function getGameTeams(game: Pick<MatchGame, "team_a" | "team_b">): [MatchTeam, MatchTeam] {
  return [game.team_a ?? "rev1", game.team_b ?? "rev2"];
}

export function getOpponentTeam(game: MatchGame, team: MatchTeam): MatchTeam | null {
  const [teamA, teamB] = getGameTeams(game);
  if (team === teamA) return teamB;
  if (team === teamB) return teamA;
  return null;
}

export function gameGkKey(game: MatchGame, team: MatchTeam): string | null {
  if (team === "rev1") {
    if (game.rev1_gk_id) return memberKey(game.rev1_gk_id);
    if (game.rev1_gk_guest_id) return guestKey(game.rev1_gk_guest_id);
    return null;
  }

  if (team === "rev2") {
    if (game.rev2_gk_id) return memberKey(game.rev2_gk_id);
    if (game.rev2_gk_guest_id) return guestKey(game.rev2_gk_guest_id);
    return null;
  }

  if (game.rev3_gk_id) return memberKey(game.rev3_gk_id);
  if (game.rev3_gk_guest_id) return guestKey(game.rev3_gk_guest_id);
  return null;
}

export function hasGameScore(game: Pick<MatchGame, "score_a" | "score_b">): boolean {
  return game.score_a !== null && game.score_b !== null;
}

/** 試合のスコア（チーム別）。未入力は0として扱う */
export function getGameScore(game: MatchGame): GameScore {
  const score: GameScore = { gameId: game.id, rev1: 0, rev2: 0, rev3: 0 };
  const [teamA, teamB] = getGameTeams(game);
  score[teamA] = game.score_a ?? 0;
  score[teamB] = game.score_b ?? 0;
  return score;
}

export function getOpponentOwnGoals(session: Pick<MatchSession, OwnGoalColumn>, team: MatchTeam): number {
  return session[`${team}_opponent_own_goals`] ?? 0;
}

/**
 * セッション内の個人成績。
 * ゴール・アシストはセッション合計（match_session_players）をそのまま使い、
 * 勝敗・GK失点などは試合ごとに保存したスコアから計算する。スコア未入力の試合は数えない。
 * 相手OGは選手ではないので、ここには出てこない。
 */
export function computeSessionStats(players: MatchPlayer[], games: MatchGame[]): SessionPlayerStats[] {
  const stats = new Map<string, SessionPlayerStats>();
  for (const player of players) {
    stats.set(matchPlayerKey(player), {
      participant: player.participant,
      team: player.team,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      goals: player.goals ?? 0,
      assists: player.assists ?? 0,
      gkGames: 0,
      gkGoalsAgainst: 0,
      teamGoalsFor: 0,
      teamGoalsAgainst: 0,
      goalDiff: 0,
    });
  }

  for (const game of games) {
    if (!hasGameScore(game)) continue;

    const score = getGameScore(game);
    const [teamA, teamB] = getGameTeams(game);
    for (const row of stats.values()) {
      const opponentTeam = row.team === teamA ? teamB : row.team === teamB ? teamA : null;
      if (!opponentTeam) continue;

      const teamScore = score[row.team];
      const opponentScore = score[opponentTeam];
      row.games += 1;
      row.teamGoalsFor += teamScore;
      row.teamGoalsAgainst += opponentScore;

      if (teamScore > opponentScore) {
        row.wins += 1;
        row.points += 3;
      } else if (teamScore < opponentScore) {
        row.losses += 1;
      } else {
        row.draws += 1;
        row.points += 1;
      }
    }

    for (const team of getGameTeams(game)) {
      const gkKey = gameGkKey(game, team);
      const opponentTeam = getOpponentTeam(game, team);
      if (gkKey && opponentTeam) {
        const gk = stats.get(gkKey);
        if (gk && gk.team === team) {
          gk.gkGames += 1;
          gk.gkGoalsAgainst += score[opponentTeam];
        }
      }
    }
  }

  for (const row of stats.values()) {
    row.goalDiff = row.teamGoalsFor - row.teamGoalsAgainst;
  }

  return [...stats.values()].sort(
    (a, b) =>
      a.team.localeCompare(b.team) ||
      compareParticipants(a.participant, b.participant)
  );
}

/** 確定前チェックの入力。転記画面で入力中の値と、DBに保存済みの値のどちらからでも作る */
export type SheetCheckInput = {
  teams: MatchTeam[];
  players: Array<{ key: string; team: MatchTeam; goals: number }>;
  ownGoals: Partial<Record<MatchTeam, number>>;
  games: Array<{
    gameNo: number;
    teamA: MatchTeam;
    teamB: MatchTeam;
    scoreA: number | null;
    scoreB: number | null;
    gkA: string | null;
    gkB: string | null;
  }>;
};

export type TeamTotals = { scoreTotal: number; goalTotal: number };
export type SheetGameProblem = { gameNo: number; team: MatchTeam };

export type SheetCheckResult = {
  teamTotals: Record<MatchTeam, TeamTotals>;
  goalMismatches: Array<TeamTotals & { team: MatchTeam }>;
  missingScores: SheetGameProblem[];
  missingGks: SheetGameProblem[];
  /** GKに、そのチームに編成されていない選手が設定されている */
  invalidGks: SheetGameProblem[];
  hasPlayers: boolean;
  hasGames: boolean;
  canConfirm: boolean;
};

export function checkSessionSheet(input: SheetCheckInput): SheetCheckResult {
  const teamTotals = Object.fromEntries(
    MATCH_TEAMS.map((team) => [team, { scoreTotal: 0, goalTotal: input.ownGoals[team] ?? 0 }])
  ) as Record<MatchTeam, TeamTotals>;
  const teamByPlayer = new Map(input.players.map((player) => [player.key, player.team]));

  for (const player of input.players) {
    teamTotals[player.team].goalTotal += player.goals;
  }

  const missingScores: SheetGameProblem[] = [];
  const missingGks: SheetGameProblem[] = [];
  const invalidGks: SheetGameProblem[] = [];

  for (const game of input.games) {
    const sides: Array<[MatchTeam, number | null, string | null]> = [
      [game.teamA, game.scoreA, game.gkA],
      [game.teamB, game.scoreB, game.gkB],
    ];
    for (const [team, score, gk] of sides) {
      teamTotals[team].scoreTotal += score ?? 0;
      if (score === null) missingScores.push({ gameNo: game.gameNo, team });
      if (!gk) missingGks.push({ gameNo: game.gameNo, team });
      else if (teamByPlayer.get(gk) !== team) invalidGks.push({ gameNo: game.gameNo, team });
    }
  }

  const goalMismatches = input.teams
    .filter((team) => teamTotals[team].scoreTotal !== teamTotals[team].goalTotal)
    .map((team) => ({ team, ...teamTotals[team] }));
  const hasPlayers = input.players.length > 0;
  const hasGames = input.games.length > 0;

  return {
    teamTotals,
    goalMismatches,
    missingScores,
    missingGks,
    invalidGks,
    hasPlayers,
    hasGames,
    canConfirm:
      hasPlayers &&
      hasGames &&
      goalMismatches.length === 0 &&
      missingScores.length === 0 &&
      missingGks.length === 0 &&
      invalidGks.length === 0,
  };
}

/** 保存済みのセッションから確定前チェックの入力を作る */
export function sheetCheckInputFromRows(
  session: Pick<MatchSession, "team_count" | OwnGoalColumn>,
  players: Array<Pick<MatchSessionPlayer, "user_id" | "guest_id" | "team" | "goals">>,
  games: MatchGame[]
): SheetCheckInput {
  const teams = getSessionTeams(session);
  return {
    teams,
    players: players.map((player) => ({
      key: player.user_id ? memberKey(player.user_id) : guestKey(player.guest_id ?? ""),
      team: player.team,
      goals: player.goals ?? 0,
    })),
    ownGoals: Object.fromEntries(teams.map((team) => [team, getOpponentOwnGoals(session, team)])),
    games: [...games]
      .sort((a, b) => a.game_no - b.game_no)
      .map((game) => {
        const [teamA, teamB] = getGameTeams(game);
        return {
          gameNo: game.game_no,
          teamA,
          teamB,
          scoreA: game.score_a,
          scoreB: game.score_b,
          gkA: gameGkKey(game, teamA),
          gkB: gameGkKey(game, teamB),
        };
      }),
  };
}

function gameProblemLabel(problems: SheetGameProblem[]): string {
  return problems.map((problem) => `第${problem.gameNo}試合 ${TEAM_LABELS[problem.team]}`).join("、");
}

/** チェックで引っかかった内容を、画面・エラーメッセージ用の文にする */
export function describeSheetProblems(result: SheetCheckResult): string[] {
  const messages: string[] = [];
  if (!result.hasPlayers) messages.push("編成が登録されていません。");
  if (!result.hasGames) messages.push("試合が登録されていません。");
  for (const mismatch of result.goalMismatches) {
    messages.push(`${TEAM_LABELS[mismatch.team]}: スコア合計 ${mismatch.scoreTotal} / ゴール合計 ${mismatch.goalTotal}`);
  }
  if (result.missingScores.length > 0) messages.push(`スコア未入力: ${gameProblemLabel(result.missingScores)}`);
  if (result.missingGks.length > 0) messages.push(`GK未入力: ${gameProblemLabel(result.missingGks)}`);
  if (result.invalidGks.length > 0) messages.push(`GKが編成外の選手: ${gameProblemLabel(result.invalidGks)}`);
  return messages;
}

export function formatRatio(numerator: number, denominator: number, digits = 2): string {
  if (denominator === 0) return "-";
  return (numerator / denominator).toFixed(digits);
}