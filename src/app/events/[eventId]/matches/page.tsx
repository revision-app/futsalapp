import { AppShell } from "@/components/AppShell";
import { MatchSessionClient } from "@/components/matches/MatchSessionClient";
import { requireUser } from "@/lib/auth";
import { compareParticipants, type MatchParticipant } from "@/lib/matchStats";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Attendance,
  EventGuest,
  Event,
  MatchGame,
  MatchPlayerGameStat,
  MatchSession,
  MatchSessionPlayer,
  Profile,
} from "@/lib/types";

type MatchResultsPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ session?: string; tab?: string; error?: string }>;
};

type AttendanceWithProfile = Attendance & { profiles: Profile | null };
type PlayerWithParticipant = MatchSessionPlayer & { profiles: Profile | null; event_guests: EventGuest | null };

function normalizeTab(value?: string): "teams" | "live" | "stats" {
  if (value === "live" || value === "stats") return value;
  return "teams";
}

export default async function MatchResultsPage({ params, searchParams }: MatchResultsPageProps) {
  const { eventId } = await params;
  const query = (await searchParams) ?? {};
  const profile = await requireUser();
  const admin = createAdminClient();

  const [{ data: event }, { data: attendanceRows }, { data: guestRows }, { data: sessionRows }] = await Promise.all([
    admin.from("events").select("*").eq("id", eventId).single(),
    admin
      .from("attendances")
      .select("*, profiles(*)")
      .eq("event_id", eventId)
      .eq("status", "attending"),
    admin
      .from("event_guests")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
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

  let players: (MatchSessionPlayer & { participant: MatchParticipant })[] = [];
  let games: MatchGame[] = [];
  let playerStats: MatchPlayerGameStat[] = [];

  if (selectedSession) {
    const [{ data: playerRows }, { data: gameRows }] = await Promise.all([
      admin
        .from("match_session_players")
        .select("*, profiles(*), event_guests(*)")
        .eq("session_id", selectedSession.id),
      admin
        .from("match_games")
        .select("*")
        .eq("session_id", selectedSession.id)
        .order("game_no", { ascending: true }),
    ]);

    players = ((playerRows ?? []) as PlayerWithParticipant[]).reduce<(MatchSessionPlayer & { participant: MatchParticipant })[]>(
      (rows, row) => {
        if (row.user_id && row.profiles) {
          rows.push({
            ...row,
            participant: { kind: "member", id: row.user_id, profile: row.profiles } satisfies MatchParticipant,
          });
        }
        if (row.guest_id && row.event_guests) {
          rows.push({
            ...row,
            participant: { kind: "guest", id: row.guest_id, guest: row.event_guests } satisfies MatchParticipant,
          });
        }
        return rows;
      },
      []
    );

    games = (gameRows ?? []) as MatchGame[];

    if (games.length > 0) {
      const { data: statRows } = await admin
        .from("match_player_game_stats")
        .select("*")
        .in(
          "game_id",
          games.map((game) => game.id)
        )
        .order("created_at", { ascending: true });

      playerStats = (statRows ?? []) as MatchPlayerGameStat[];
    }
  }

  const attendees: MatchParticipant[] = ((attendanceRows ?? []) as AttendanceWithProfile[])
    .map((row) => row.profiles)
    .filter((row): row is Profile => Boolean(row))
    .map((row) => ({ kind: "member", id: row.id, profile: row }));

  attendees.push(
    ...((guestRows ?? []) as EventGuest[]).map((guest) => ({
      kind: "guest" as const,
      id: guest.id,
      guest,
    }))
  );

  attendees.sort(compareParticipants);

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
        playerStats={playerStats}
        initialTab={normalizeTab(query.tab)}
        error={query.error}
      />
    </AppShell>
  );
}
