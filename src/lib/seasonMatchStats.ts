import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileDisplayName } from "@/lib/profile";
import type {
  Attendance,
  Event,
  MatchGame,
  MatchGoalRecord,
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

function scoreForGame(gameId: string, goalsByGame: Map<string, MatchGoalRecord[]>) {
  const goals = goalsByGame.get(gameId) ?? [];
  return {
    rev1: goals.filter((goal) => goal.team === "rev1").length,
    rev2: goals.filter((goal) => goal.team === "rev2").length,
  };
}

function teamScores(team: MatchTeam, score: { rev1: number; rev2: number }) {
  return team === "rev1"
    ? { for: score.rev1, against: score.rev2 }
    : { for: score.rev2, against: score.rev1 };
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
  let goalRows: MatchGoalRecord[] = [];
  if (gameIds.length > 0) {
    const { data: goals } = await admin
      .from("match_goal_records")
      .select("*")
      .in("game_id", gameIds)
      .is("cancelled_at", null);
    goalRows = (goals ?? []) as MatchGoalRecord[];
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

  const goalsByGame = new Map<string, MatchGoalRecord[]>();
  for (const goal of goalRows) {
    const rows = goalsByGame.get(goal.game_id) ?? [];
    rows.push(goal);
    goalsByGame.set(goal.game_id, rows);
  }

  for (const session of sessionRows) {
    const sessionPlayers = playersBySession.get(session.id) ?? [];
    const sessionGames = gamesBySession.get(session.id) ?? [];
    const teamByUserId = new Map(sessionPlayers.map((player) => [player.user_id, player.team]));

    for (const player of sessionPlayers) {
      const row = stats.get(player.user_id);
      if (row) row.games += sessionGames.length;
    }

    for (const game of sessionGames) {
      const score = scoreForGame(game.id, goalsByGame);

      for (const player of sessionPlayers) {
        const row = stats.get(player.user_id);
        if (!row) continue;

        const side = teamScores(player.team, score);
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

      if (game.rev1_gk_id && teamByUserId.get(game.rev1_gk_id) === "rev1") {
        const row = stats.get(game.rev1_gk_id);
        if (row) {
          row.gkGames += 1;
          row.gkGoalsAgainst += score.rev2;
        }
      }

      if (game.rev2_gk_id && teamByUserId.get(game.rev2_gk_id) === "rev2") {
        const row = stats.get(game.rev2_gk_id);
        if (row) {
          row.gkGames += 1;
          row.gkGoalsAgainst += score.rev1;
        }
      }

      for (const goal of goalsByGame.get(game.id) ?? []) {
        const scorer = stats.get(goal.scorer_id);
        if (scorer && teamByUserId.get(goal.scorer_id) === goal.team) {
          scorer.goals += 1;
          scorer.goalGames.add(game.id);
        }

        if (goal.assist_id) {
          const assister = stats.get(goal.assist_id);
          if (assister && teamByUserId.get(goal.assist_id) === goal.team) {
            assister.assists += 1;
            assister.assistGames.add(game.id);
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
