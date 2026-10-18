import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileDisplayName } from "@/lib/profile";
import type {
  Attendance,
  Event,
  MatchGame,
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

function gameTeams(game: MatchGame): [MatchTeam, MatchTeam] {
  return [game.team_a ?? "rev1", game.team_b ?? "rev2"];
}

function scoreForGame(game: MatchGame): TeamScore {
  const score: TeamScore = { rev1: 0, rev2: 0, rev3: 0 };
  const [teamA, teamB] = gameTeams(game);
  score[teamA] = game.score_a ?? 0;
  score[teamB] = game.score_b ?? 0;
  return score;
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

  for (const session of sessionRows) {
    const sessionPlayers = playersBySession.get(session.id) ?? [];
    const sessionGames = gamesBySession.get(session.id) ?? [];
    const memberPlayers = sessionPlayers.filter((player): player is MatchSessionPlayer & { user_id: string } => Boolean(player.user_id));
    const teamByUserId = new Map(memberPlayers.map((player) => [player.user_id, player.team]));

    // ゴール・アシストはセッション合計。相手OGは選手ではないので個人成績には入らない
    for (const player of memberPlayers) {
      const row = stats.get(player.user_id);
      if (row) {
        row.goals += player.goals ?? 0;
        row.assists += player.assists ?? 0;
      }
    }

    for (const game of sessionGames) {
      if (game.score_a === null || game.score_b === null) continue;
      const score = scoreForGame(game);

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