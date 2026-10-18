// 移行前（リアルタイム入力方式）の個人成績の計算。
// 020 マイグレーションの前後で数値が変わらないことを確かめるための参照実装で、
// 移行前の src/lib/seasonMatchStats.ts の集計部分をそのまま写している（試合のスコアも選手の試合ごとの成績から求める）。
import type { MatchGame, MatchPlayerGameStat, MatchSessionPlayer, MatchTeam } from "@/lib/types";
import { admin } from "./helpers";

export type LegacyUserStats = {
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
};

type TeamScore = Record<MatchTeam, number>;

function gameTeams(game: MatchGame): [MatchTeam, MatchTeam] {
  return [game.team_a ?? "rev1", game.team_b ?? "rev2"];
}

function opponentTeam(game: MatchGame, team: MatchTeam): MatchTeam | null {
  const [teamA, teamB] = gameTeams(game);
  if (team === teamA) return teamB;
  if (team === teamB) return teamA;
  return null;
}

function scoreForGame(stats: MatchPlayerGameStat[]): TeamScore {
  return {
    rev1: stats.filter((stat) => stat.team === "rev1").reduce((sum, stat) => sum + stat.goals, 0),
    rev2: stats.filter((stat) => stat.team === "rev2").reduce((sum, stat) => sum + stat.goals, 0),
    rev3: stats.filter((stat) => stat.team === "rev3").reduce((sum, stat) => sum + stat.goals, 0),
  };
}

/** 確定済みセッションだけを対象に、旧方式で userIds の個人成績を計算する */
export async function legacySeasonStats(sessionIds: string[], userIds: string[]): Promise<Map<string, LegacyUserStats>> {
  const { data: sessions } = await admin().from("match_sessions").select("id").in("id", sessionIds).eq("status", "confirmed");
  const confirmedIds = (sessions ?? []).map((session) => session.id as string);

  const [{ data: players }, { data: games }] = await Promise.all([
    admin().from("match_session_players").select("*").in("session_id", confirmedIds),
    admin().from("match_games").select("*").in("session_id", confirmedIds),
  ]);
  const gameRows = (games ?? []) as MatchGame[];
  const { data: gameStats } = await admin()
    .from("match_player_game_stats")
    .select("*")
    .in("game_id", gameRows.map((game) => game.id));

  const stats = new Map<string, LegacyUserStats>(
    userIds.map((id) => [
      id,
      { games: 0, wins: 0, losses: 0, draws: 0, points: 0, goals: 0, assists: 0, gkGames: 0, gkGoalsAgainst: 0, teamGoalsFor: 0, teamGoalsAgainst: 0 },
    ])
  );

  const statsByGame = new Map<string, MatchPlayerGameStat[]>();
  for (const stat of (gameStats ?? []) as MatchPlayerGameStat[]) {
    statsByGame.set(stat.game_id, [...(statsByGame.get(stat.game_id) ?? []), stat]);
  }

  for (const sessionId of confirmedIds) {
    const memberPlayers = ((players ?? []) as MatchSessionPlayer[]).filter(
      (player): player is MatchSessionPlayer & { user_id: string } => player.session_id === sessionId && Boolean(player.user_id)
    );
    const teamByUserId = new Map(memberPlayers.map((player) => [player.user_id, player.team]));

    for (const game of gameRows.filter((row) => row.session_id === sessionId)) {
      const score = scoreForGame(statsByGame.get(game.id) ?? []);

      for (const player of memberPlayers) {
        const row = stats.get(player.user_id);
        const opponent = opponentTeam(game, player.team);
        if (!row || !opponent) continue;

        const goalsFor = score[player.team];
        const goalsAgainst = score[opponent];
        row.games += 1;
        row.teamGoalsFor += goalsFor;
        row.teamGoalsAgainst += goalsAgainst;
        if (goalsFor > goalsAgainst) {
          row.wins += 1;
          row.points += 3;
        } else if (goalsFor < goalsAgainst) {
          row.losses += 1;
        } else {
          row.draws += 1;
          row.points += 1;
        }
      }

      for (const team of gameTeams(game)) {
        const opponent = opponentTeam(game, team);
        if (!opponent) continue;
        const gkId = team === "rev1" ? game.rev1_gk_id : team === "rev2" ? game.rev2_gk_id : game.rev3_gk_id;
        if (gkId && teamByUserId.get(gkId) === team) {
          const row = stats.get(gkId);
          if (row) {
            row.gkGames += 1;
            row.gkGoalsAgainst += score[opponent];
          }
        }
      }

      for (const stat of statsByGame.get(game.id) ?? []) {
        if (stat.user_id && teamByUserId.get(stat.user_id) === stat.team) {
          const row = stats.get(stat.user_id);
          if (row) {
            row.goals += stat.goals;
            row.assists += stat.assists;
          }
        }
      }
    }
  }

  return stats;
}
