import type { MatchGame, MatchGoalRecord, MatchSessionPlayer, MatchTeam, Profile } from "@/lib/types";

export type MatchPlayer = MatchSessionPlayer & { profile: Profile };

export type GameScore = {
  gameId: string;
  rev1: number;
  rev2: number;
};

export type SessionPlayerStats = {
  user: Profile;
  team: MatchTeam;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  goals: number;
  assists: number;
  goalGames: number;
  assistGames: number;
  gkGames: number;
  gkGoalsAgainst: number;
  teamGoalsFor: number;
  teamGoalsAgainst: number;
  goalDiff: number;
};

export function activeGoals(goals: MatchGoalRecord[]): MatchGoalRecord[] {
  return goals.filter((goal) => !goal.cancelled_at);
}

export function getGameScore(game: MatchGame, goals: MatchGoalRecord[]): GameScore {
  const current = activeGoals(goals).filter((goal) => goal.game_id === game.id);
  return {
    gameId: game.id,
    rev1: current.filter((goal) => goal.team === "rev1").length,
    rev2: current.filter((goal) => goal.team === "rev2").length,
  };
}

export function getGameLabel(game: MatchGame, goals: MatchGoalRecord[]): string {
  const score = getGameScore(game, goals);
  return `第${game.game_no}試合 ${score.rev1} - ${score.rev2}`;
}

export function computeSessionStats(
  players: MatchPlayer[],
  games: MatchGame[],
  goals: MatchGoalRecord[]
): SessionPlayerStats[] {
  const currentGoals = activeGoals(goals);
  const goalGamesByUser = new Map<string, Set<string>>();
  const assistGamesByUser = new Map<string, Set<string>>();

  const stats = new Map<string, SessionPlayerStats>();
  for (const player of players) {
    stats.set(player.user_id, {
      user: player.profile,
      team: player.team,
      games: games.length,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      goals: 0,
      assists: 0,
      goalGames: 0,
      assistGames: 0,
      gkGames: 0,
      gkGoalsAgainst: 0,
      teamGoalsFor: 0,
      teamGoalsAgainst: 0,
      goalDiff: 0,
    });
  }

  for (const goal of currentGoals) {
    const scorer = stats.get(goal.scorer_id);
    if (scorer) {
      scorer.goals += 1;
      const set = goalGamesByUser.get(goal.scorer_id) ?? new Set<string>();
      set.add(goal.game_id);
      goalGamesByUser.set(goal.scorer_id, set);
    }

    if (goal.assist_id) {
      const assister = stats.get(goal.assist_id);
      if (assister) {
        assister.assists += 1;
        const set = assistGamesByUser.get(goal.assist_id) ?? new Set<string>();
        set.add(goal.game_id);
        assistGamesByUser.set(goal.assist_id, set);
      }
    }
  }

  for (const game of games) {
    const score = getGameScore(game, goals);
    for (const row of stats.values()) {
      const teamScore = row.team === "rev1" ? score.rev1 : score.rev2;
      const opponentScore = row.team === "rev1" ? score.rev2 : score.rev1;
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

    if (game.rev1_gk_id) {
      const gk = stats.get(game.rev1_gk_id);
      if (gk) {
        gk.gkGames += 1;
        gk.gkGoalsAgainst += score.rev2;
      }
    }

    if (game.rev2_gk_id) {
      const gk = stats.get(game.rev2_gk_id);
      if (gk) {
        gk.gkGames += 1;
        gk.gkGoalsAgainst += score.rev1;
      }
    }
  }

  for (const row of stats.values()) {
    row.goalGames = goalGamesByUser.get(row.user.id)?.size ?? 0;
    row.assistGames = assistGamesByUser.get(row.user.id)?.size ?? 0;
    row.goalDiff = row.teamGoalsFor - row.teamGoalsAgainst;
  }

  return [...stats.values()].sort(
    (a, b) =>
      a.team.localeCompare(b.team) ||
      (a.user.uniform_no ?? 9999) - (b.user.uniform_no ?? 9999) ||
      a.user.display_name.localeCompare(b.user.display_name)
  );
}

export function formatRatio(numerator: number, denominator: number, digits = 2): string {
  if (denominator === 0) return "-";
  return (numerator / denominator).toFixed(digits);
}
