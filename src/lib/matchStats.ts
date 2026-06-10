import { getProfileDisplayName } from "@/lib/profile";
import type { EventGuest, MatchGame, MatchGoalRecord, MatchSessionPlayer, MatchTeam, Profile } from "@/lib/types";

export type MatchParticipant =
  | { kind: "member"; id: string; profile: Profile }
  | { kind: "guest"; id: string; guest: EventGuest };

export type MatchPlayer = MatchSessionPlayer & { participant: MatchParticipant };

export type GameScore = {
  gameId: string;
  rev1: number;
  rev2: number;
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
  goalGames: number;
  assistGames: number;
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

export function goalScorerKey(goal: MatchGoalRecord): string {
  return goal.scorer_id ? memberKey(goal.scorer_id) : guestKey(goal.scorer_guest_id ?? "");
}

export function goalAssistKey(goal: MatchGoalRecord): string | null {
  if (goal.assist_id) return memberKey(goal.assist_id);
  if (goal.assist_guest_id) return guestKey(goal.assist_guest_id);
  return null;
}

export function gameGkKey(game: MatchGame, team: MatchTeam): string | null {
  if (team === "rev1") {
    if (game.rev1_gk_id) return memberKey(game.rev1_gk_id);
    if (game.rev1_gk_guest_id) return guestKey(game.rev1_gk_guest_id);
    return null;
  }

  if (game.rev2_gk_id) return memberKey(game.rev2_gk_id);
  if (game.rev2_gk_guest_id) return guestKey(game.rev2_gk_guest_id);
  return null;
}

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
    stats.set(matchPlayerKey(player), {
      participant: player.participant,
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
    const scorerKey = goalScorerKey(goal);
    const scorer = stats.get(scorerKey);
    if (scorer) {
      scorer.goals += 1;
      const set = goalGamesByUser.get(scorerKey) ?? new Set<string>();
      set.add(goal.game_id);
      goalGamesByUser.set(scorerKey, set);
    }

    const assistKey = goalAssistKey(goal);
    if (assistKey) {
      const assister = stats.get(assistKey);
      if (assister) {
        assister.assists += 1;
        const set = assistGamesByUser.get(assistKey) ?? new Set<string>();
        set.add(goal.game_id);
        assistGamesByUser.set(assistKey, set);
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

    const rev1GkKey = gameGkKey(game, "rev1");
    if (rev1GkKey) {
      const gk = stats.get(rev1GkKey);
      if (gk) {
        gk.gkGames += 1;
        gk.gkGoalsAgainst += score.rev2;
      }
    }

    const rev2GkKey = gameGkKey(game, "rev2");
    if (rev2GkKey) {
      const gk = stats.get(rev2GkKey);
      if (gk) {
        gk.gkGames += 1;
        gk.gkGoalsAgainst += score.rev1;
      }
    }
  }

  for (const row of stats.values()) {
    const key = participantKey(row.participant);
    row.goalGames = goalGamesByUser.get(key)?.size ?? 0;
    row.assistGames = assistGamesByUser.get(key)?.size ?? 0;
    row.goalDiff = row.teamGoalsFor - row.teamGoalsAgainst;
  }

  return [...stats.values()].sort(
    (a, b) =>
      a.team.localeCompare(b.team) ||
      compareParticipants(a.participant, b.participant)
  );
}

export function formatRatio(numerator: number, denominator: number, digits = 2): string {
  if (denominator === 0) return "-";
  return (numerator / denominator).toFixed(digits);
}
