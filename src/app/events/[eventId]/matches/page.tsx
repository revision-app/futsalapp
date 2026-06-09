import { AppShell } from "@/components/AppShell";
import { MatchSessionClient } from "@/components/matches/MatchSessionClient";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Attendance,
  Event,
  MatchGame,
  MatchGoalRecord,
  MatchSession,
  MatchSessionPlayer,
  Profile,
} from "@/lib/types";

type MatchResultsPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ session?: string; tab?: string; error?: string }>;
};

type AttendanceWithProfile = Attendance & { profiles: Profile | null };
type PlayerWithProfile = MatchSessionPlayer & { profiles: Profile | null };

function normalizeTab(value?: string): "teams" | "live" | "stats" {
  if (value === "live" || value === "stats") return value;
  return "teams";
}

export default async function MatchResultsPage({ params, searchParams }: MatchResultsPageProps) {
  const { eventId } = await params;
  const query = (await searchParams) ?? {};
  const profile = await requireUser();
  const admin = createAdminClient();

  const [{ data: event }, { data: attendanceRows }, { data: sessionRows }] = await Promise.all([
    admin.from("events").select("*").eq("id", eventId).single(),
    admin
      .from("attendances")
      .select("*, profiles(*)")
      .eq("event_id", eventId)
      .eq("status", "attending"),
    admin
      .from("match_sessions")
      .select("*")
      .eq("event_id", eventId)
      .order("session_no", { ascending: true }),
  ]);

  if (!event) {
    return (
      <AppShell profile={profile} active="events">
        <div className="card p-6 text-sm text-slate-500">イベントが見つかりません。</div>
      </AppShell>
    );
  }

  const sessions = (sessionRows ?? []) as MatchSession[];
  const selectedSession =
    sessions.find((session) => session.id === query.session) ??
    sessions[sessions.length - 1] ??
    null;

  let players: (MatchSessionPlayer & { profile: Profile })[] = [];
  let games: MatchGame[] = [];
  let goals: MatchGoalRecord[] = [];

  if (selectedSession) {
    const [{ data: playerRows }, { data: gameRows }] = await Promise.all([
      admin
        .from("match_session_players")
        .select("*, profiles(*)")
        .eq("session_id", selectedSession.id),
      admin
        .from("match_games")
        .select("*")
        .eq("session_id", selectedSession.id)
        .order("game_no", { ascending: true }),
    ]);

    players = ((playerRows ?? []) as PlayerWithProfile[])
      .filter((row): row is PlayerWithProfile & { profiles: Profile } => Boolean(row.profiles))
      .map((row) => ({
        ...row,
        profile: row.profiles,
      }));

    games = (gameRows ?? []) as MatchGame[];

    if (games.length > 0) {
      const { data: goalRows } = await admin
        .from("match_goal_records")
        .select("*")
        .in(
          "game_id",
          games.map((game) => game.id)
        )
        .order("created_at", { ascending: true });

      goals = (goalRows ?? []) as MatchGoalRecord[];
    }
  }

  const attendees = ((attendanceRows ?? []) as AttendanceWithProfile[])
    .map((row) => row.profiles)
    .filter((row): row is Profile => Boolean(row))
    .sort((a, b) => (a.uniform_no ?? 9999) - (b.uniform_no ?? 9999) || a.display_name.localeCompare(b.display_name));

  return (
    <AppShell profile={profile} active="events">
      <MatchSessionClient
        event={event as Event}
        profile={profile}
        attendees={attendees}
        sessions={sessions}
        selectedSession={selectedSession}
        players={players}
        games={games}
        goals={goals}
        initialTab={normalizeTab(query.tab)}
        error={query.error}
      />
    </AppShell>
  );
}
