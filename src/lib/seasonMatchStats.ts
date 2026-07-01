import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileDisplayName } from "@/lib/profile";
import type {
  Attendance,
  Event,
  MatchGame,
  MatchPlayerGameStat,
  MatchSession,
  MatchSessionPlayer,
  MatchTeam,
  MvpVote,
  Profile,
} from "@/lib/types";

export type SeasonUserStats = {
  user: Profile;
  attendanceDays: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  goals: number;
  assists: number;
  goalGames: Set<string>;
  assistGames: Set<string>;
  gkGames: number;
  gkGoalsAgainst: number;
  teamGoalsFor: number;
  teamGoalsAgainst: number;
};

export type SeasonMatchStats = {
  events: Event[];
  users: Profile[];
  stats: SeasonUserStats[];
  mvpTotals: Array<{ user: Profile; total: number; votes: number }>;
};

export function statRatio(numerator: number, denominator: number, digits = 3): string {
  if (denominator === 0) return "-";
  return (numerator / denominator).toFixed(digits);
}

export function statAverage(numerator: number, denominator: number, digits = 2): string {
  if (denominator === 0) return "-";
  return (numerator / denominator).toFixed(digits);
}

type TeamScore = Record<MatchTeam, number>;

function scoreForGame(gameId: string, statsByGame: Map<string, MatchPlayerGameStat[]>): TeamScore {
  const stats = statsByGame.get(gameId) ?? [];
  return {
    rev1: stats.filter((stat) => stat.team === "rev1").reduce((sum, stat) => sum + stat.goals, 0),
    rev2: stats.filter((stat) => stat.team === "rev2").reduce((sum, stat) => sum + stat.goals, 0),
    rev3: stats.filter((stat) => stat.team === "rev3").reduce((sum, stat) => sum + stat.goals, 0),
  };
}

function gameTeams(game: MatchGame): [MatchTeam, MatchTeam] {
  return [game.team_a ?? "rev1", game.team_b ?? "rev2"];
}

function opponentTeam(game: MatchGame, team: MatchTeam): MatchTeam | null {
  const [teamA, teamB] = gameTeams(game);
  if (team === teamA) return teamB;
  if (team === teamB) return teamA;
  return null;
}

function teamScores(game: MatchGame, team: MatchTeam, score: TeamScore) {
  const opponent = opponentTeam(game, team);
  return opponent ? { for: score[team], against: score[opponent] } : null;
}

function sortUsers(a: Profile, b: Profile): number {
  return (
    (a.uniform_no ?? 9999) - (b.uniform_no ?? 9999) ||
    getProfileDisplayName(a).localeCompare(getProfileDisplayName(b))
  );
}

export function sortStatsByUser(stats: SeasonUserStats[]): SeasonUserStats[] {
  return [...stats].sort((a, b) => sortUsers(a.user, b.user));
}

export async function getSeasonMatchStats(seasonId: string): Promise<SeasonMatchStats> {
  const admin = createAdminClient();

  const [{ data: events }, { data: users }] = await Promise.all([
    admin.from("events").select("*").eq("season_id", seasonId).order("event_date", { ascending: true }),
    admin.from("profiles").select("*").eq("is_active", true).order("uniform_no", { ascending: true }),
  ]);

  const eventRows = (events ?? []) as Event[];
  const userRows = ((users ?? []) as Profile[]).sort(sortUsers);
  const eventIds = eventRows.map((event) => event.id);

  let attendanceRows: Attendance[] = [];
  let sessionRows: MatchSession[] = [];
  let voteRows: (MvpVote & { votee: Profile | null })[] = [];

  if (eventIds.length > 0) {
    const [{ data: attendances }, { data: sessions }, { data: votes }] = await Promise.all([
      admin.from("attendances").select("*").in("event_id", eventIds),
      admin
        .from("match_sessions")
        .select("*")
        .in("event_id", eventIds)
        .eq("status", "confirmed"),
      admin
        .from("mvp_votes")
        .select("*, votee:profiles!mvp_votes_votee_id_fkey(*)")
        .in("event_id", eventIds),
    ]);
    attendanceRows = (attendances ?? []) as Attendance[];
    sessionRows = (sessions ?? []) as MatchSession[];
    voteRows = (votes ?? []) as (MvpVote & { votee: Profile | null })[];
  }

  const sessionIds = sessionRows.map((session) => session.id);
  let playerRows: MatchSessionPlayer[] = [];
  let gameRows: MatchGame[] = [];

  if (sessionIds.length > 0) {
    const [{ data: players }, { data: games }] = await Promise.all([
      admin.from("match_session_players").select("*").in("session_id", sessionIds),
      admin.from("match_games").select("*").in("session_id", sessionIds),
    ]);
    playerRows = (players ?? []) as MatchSessionPlayer[];
    gameRows = (games ?? []) as MatchGame[];
  }

  const gameIds = gameRows.map((game) => game.id);
  let gameStatRows: MatchPlayerGameStat[] = [];
  if (gameIds.length > 0) {
    const { data: playerGameStats } = await admin
      .from("match_player_game_stats")
      .select("*")
      .in("game_id", gameIds);
    gameStatRows = (playerGameStats ?? []) as MatchPlayerGameStat[];
  }

  const stats = new Map<string, SeasonUserStats>(
    userRows.map((user) => [
      user.id,
      {
        user,
        attendanceDays: 0,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        goals: 0,
        assists: 0,
        goalGames: new Set<string>(),
        assistGames: new Set<string>(),
        gkGames: 0,
        gkGoalsAgainst: 0,
        teamGoalsFor: 0,
        teamGoalsAgainst: 0,
      },
    ])
  );

  for (const attendance of attendanceRows) {
    if (attendance.status === "attending") {
      const row = stats.get(attendance.user_id);
      if (row) row.attendanceDays += 1;
    }
  }

  const gamesBySession = new Map<string, MatchGame[]>();
  for (const game of gameRows) {
    const rows = gamesBySession.get(game.session_id) ?? [];
    rows.push(game);
    gamesBySession.set(game.session_id, rows);
  }

  const playersBySession = new Map<string, MatchSessionPlayer[]>();
  for (const player of playerRows) {
    const rows = playersBySession.get(player.session_id) ?? [];
    rows.push(player);
    playersBySession.set(player.session_id, rows);
  }

  const statsByGame = new Map<string, MatchPlayerGameStat[]>();
  for (const stat of gameStatRows) {
    const rows = statsByGame.get(stat.game_id) ?? [];
    rows.push(stat);
    statsByGame.set(stat.game_id, rows);
  }

  for (const session of sessionRows) {
    const sessionPlayers = playersBySession.get(session.id) ?? [];
    const sessionGames = gamesBySession.get(session.id) ?? [];
    const memberPlayers = sessionPlayers.filter((player): player is MatchSessionPlayer & { user_id: string } => Boolean(player.user_id));
    const teamByUserId = new Map(memberPlayers.map((player) => [player.user_id, player.team]));

    for (const game of sessionGames) {
      const score = scoreForGame(game.id, statsByGame);

      for (const player of memberPlayers) {
        const row = stats.get(player.user_id);
        if (!row) continue;

        const side = teamScores(game, player.team, score);
        if (!side) continue;

        row.games += 1;
        row.teamGoalsFor += side.for;
        row.teamGoalsAgainst += side.against;

        if (side.for > side.against) {
          row.wins += 1;
          row.points += 3;
        } else if (side.for < side.against) {
          row.losses += 1;
        } else {
          row.draws += 1;
          row.points += 1;
        }
      }

      for (const team of gameTeams(game)) {
        const opponent = opponentTeam(game, team);
        if (!opponent) continue;

        const gkId =
          team === "rev1" ? game.rev1_gk_id : team === "rev2" ? game.rev2_gk_id : game.rev3_gk_id;

        if (gkId && teamByUserId.get(gkId) === team) {
          const row = stats.get(gkId);
          if (row) {
            row.gkGames += 1;
            row.gkGoalsAgainst += score[opponent];
          }
        }
      }

      for (const playerGameStat of statsByGame.get(game.id) ?? []) {
        if (playerGameStat.user_id && teamByUserId.get(playerGameStat.user_id) === playerGameStat.team) {
          const row = stats.get(playerGameStat.user_id);
          if (row) {
            row.goals += playerGameStat.goals;
            row.assists += playerGameStat.assists;
            if (playerGameStat.goals > 0) row.goalGames.add(game.id);
            if (playerGameStat.assists > 0) row.assistGames.add(game.id);
          }
        }
      }
    }
  }

  const mvpMap = new Map<string, { user: Profile; total: number; votes: number }>();
  for (const vote of voteRows) {
    if (!vote.votee) continue;
    const row = mvpMap.get(vote.votee_id) ?? { user: vote.votee, total: 0, votes: 0 };
    row.total += vote.points;
    row.votes += 1;
    mvpMap.set(vote.votee_id, row);
  }

  return {
    events: eventRows,
    users: userRows,
    stats: sortStatsByUser([...stats.values()]),
    mvpTotals: [...mvpMap.values()].sort(
      (a, b) => b.total - a.total || b.votes - a.votes || sortUsers(a.user, b.user)
    ),
  };
}