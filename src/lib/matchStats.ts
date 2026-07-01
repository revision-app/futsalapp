import { getProfileDisplayName } from "@/lib/profile";
import type { EventGuest, MatchGame, MatchPlayerGameStat, MatchSessionPlayer, MatchTeam, Profile } from "@/lib/types";

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

export function matchStatPlayerKey(stat: Pick<MatchPlayerGameStat, "user_id" | "guest_id">): string | null {
  if (stat.user_id) return memberKey(stat.user_id);
  if (stat.guest_id) return guestKey(stat.guest_id);
  return null;
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

export function getGameScore(game: MatchGame, playerStats: MatchPlayerGameStat[]): GameScore {
  const current = playerStats.filter((stat) => stat.game_id === game.id);
  return {
    gameId: game.id,
    rev1: current.filter((stat) => stat.team === "rev1").reduce((sum, stat) => sum + stat.goals, 0),
    rev2: current.filter((stat) => stat.team === "rev2").reduce((sum, stat) => sum + stat.goals, 0),
    rev3: current.filter((stat) => stat.team === "rev3").reduce((sum, stat) => sum + stat.goals, 0),
  };
}

export function getGameLabel(game: MatchGame, playerStats: MatchPlayerGameStat[]): string {
  const score = getGameScore(game, playerStats);
  const [teamA, teamB] = getGameTeams(game);
  return `第${game.game_no}試合 ${TEAM_LABELS[teamA]} ${score[teamA]} - ${score[teamB]} ${TEAM_LABELS[teamB]}`;
}

export function computeSessionStats(
  players: MatchPlayer[],
  games: MatchGame[],
  playerStats: MatchPlayerGameStat[]
): SessionPlayerStats[] {
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

  const goalGamesByUser = new Map<string, Set<string>>();
  const assistGamesByUser = new Map<string, Set<string>>();

  for (const stat of playerStats) {
    const key = matchStatPlayerKey(stat);
    if (!key) continue;

    const row = stats.get(key);
    if (!row) continue;

    row.goals += stat.goals;
    row.assists += stat.assists;

    if (stat.goals > 0) {
      const set = goalGamesByUser.get(key) ?? new Set<string>();
      set.add(stat.game_id);
      goalGamesByUser.set(key, set);
    }
    if (stat.assists > 0) {
      const set = assistGamesByUser.get(key) ?? new Set<string>();
      set.add(stat.game_id);
      assistGamesByUser.set(key, set);
    }
  }

  for (const game of games) {
    const score = getGameScore(game, playerStats);
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
        if (gk) {
          gk.gkGames += 1;
          gk.gkGoalsAgainst += score[opponentTeam];
        }
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