"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchSession, MatchTeam, Profile } from "@/lib/types";

type ParticipantRef = {
  kind: "member" | "guest";
  id: string;
};

type MatchStatKind = "goal" | "assist";

const THREE_TEAM_GAME_SEQUENCE: [MatchTeam, MatchTeam][] = [
  ["rev1", "rev2"],
  ["rev2", "rev3"],
  ["rev3", "rev1"],
];

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalString(formData: FormData, key: string): string | null {
  const value = getString(formData, key);
  return value || null;
}

function isMatchTeam(value: string): value is MatchTeam {
  return value === "rev1" || value === "rev2" || value === "rev3";
}

function parseTeamCount(value: string): 2 | 3 {
  return value === "3" ? 3 : 2;
}

function sessionTeams(session: Pick<MatchSession, "team_count">): MatchTeam[] {
  return session.team_count === 3 ? ["rev1", "rev2", "rev3"] : ["rev1", "rev2"];
}

function gameTeams(game: { team_a?: MatchTeam | null; team_b?: MatchTeam | null }): [MatchTeam, MatchTeam] {
  return [game.team_a ?? "rev1", game.team_b ?? "rev2"];
}

function opponentTeam(game: { team_a?: MatchTeam | null; team_b?: MatchTeam | null }, team: MatchTeam): MatchTeam | null {
  const [teamA, teamB] = gameTeams(game);
  if (team === teamA) return teamB;
  if (team === teamB) return teamA;
  return null;
}

function nextGameTeams(session: Pick<MatchSession, "team_count">, currentLatestGameNo: number): [MatchTeam, MatchTeam] {
  if (session.team_count !== 3) return ["rev1", "rev2"];
  return THREE_TEAM_GAME_SEQUENCE[currentLatestGameNo % THREE_TEAM_GAME_SEQUENCE.length];
}

function parseParticipantKey(value: string): ParticipantRef {
  const [kind, id] = value.split(":");
  if ((kind !== "member" && kind !== "guest") || !id) {
    throw new Error("Invalid participant.");
  }
  return { kind, id };
}

function getParticipantRef(formData: FormData, key: string): ParticipantRef {
  const value = getString(formData, key);
  if (value) return parseParticipantKey(value);

  const kind = getString(formData, "participant_kind");
  const id = getString(formData, "participant_id") || getString(formData, "user_id");
  if (kind === "guest" && id) return { kind: "guest", id };
  if ((kind === "member" || !kind) && id) return { kind: "member", id };

  throw new Error("Invalid participant.");
}

function getOptionalParticipantRef(formData: FormData, key: string): ParticipantRef | null {
  const value = getString(formData, key);
  return value ? parseParticipantKey(value) : null;
}

function getMatchStatKind(formData: FormData): MatchStatKind {
  const value = getString(formData, "stat");
  if (value === "goal" || value === "assist") return value;
  throw new Error("Invalid stat.");
}


function participantColumns(participant: ParticipantRef): { user_id: string | null; guest_id: string | null } {
  return participant.kind === "member"
    ? { user_id: participant.id, guest_id: null }
    : { user_id: null, guest_id: participant.id };
}

function matchesPath(eventId: string, sessionId?: string, tab?: string): string {
  const params = new URLSearchParams();
  if (sessionId) params.set("session", sessionId);
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return `/events/${eventId}/matches${query ? `?${query}` : ""}`;
}

function redirectWithError(eventId: string, sessionId: string | null, message: string, tab?: string): never {
  const params = new URLSearchParams();
  if (sessionId) params.set("session", sessionId);
  if (tab) params.set("tab", tab);
  params.set("error", message);
  redirect(`/events/${eventId}/matches?${params.toString()}`);
}

async function requireMatchEditor(eventId: string): Promise<Profile> {
  const currentUser = await requireUser();
  if (currentUser.role === "admin") return currentUser;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("attendances")
    .select("status")
    .eq("event_id", eventId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.status !== "attending") {
    redirectWithError(eventId, null, "試合結果の記録は出席者のみ操作できます。");
  }

  return currentUser;
}

async function getSession(sessionId: string): Promise<MatchSession> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("match_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Session not found.");
  return data as MatchSession;
}

async function requireEditableSession(sessionId: string): Promise<{ currentUser: Profile; session: MatchSession }> {
  const session = await getSession(sessionId);
  const currentUser = await requireMatchEditor(session.event_id);

  if (session.status === "confirmed" && currentUser.role !== "admin") {
    redirectWithError(session.event_id, sessionId, "確定済みセッションは管理者のみ変更できます。");
  }

  return { currentUser, session };
}

async function getGameSession(gameId: string): Promise<MatchSession> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("match_games")
    .select("session_id")
    .eq("id", gameId)
    .single();

  if (error || !data?.session_id) throw new Error(error?.message ?? "Game not found.");
  return getSession(data.session_id);
}

async function ensureGameGksSet(gameId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("match_games")
    .select("team_a, team_b, rev1_gk_id, rev1_gk_guest_id, rev2_gk_id, rev2_gk_guest_id, rev3_gk_id, rev3_gk_guest_id")
    .eq("id", gameId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Game not found.");

  const missingGk = gameTeams(data).some((team) => {
    if (team === "rev1") return !data.rev1_gk_id && !data.rev1_gk_guest_id;
    if (team === "rev2") return !data.rev2_gk_id && !data.rev2_gk_guest_id;
    return !data.rev3_gk_id && !data.rev3_gk_guest_id;
  });

  if (missingGk) {
    const session = await getGameSession(gameId);
    redirectWithError(session.event_id, session.id, "ゴール入力は両チームのGKを設定してから行えます。", "live");
  }
}

async function ensureParticipantCanPlay(eventId: string, participant: ParticipantRef, sessionId: string) {
  const admin = createAdminClient();

  if (participant.kind === "guest") {
    const { data, error } = await admin
      .from("event_guests")
      .select("id")
      .eq("event_id", eventId)
      .eq("id", participant.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      redirectWithError(eventId, sessionId, "このイベントに登録されているゲストだけを編成・記録に追加できます。", "teams");
    }
    return;
  }

  const { data, error } = await admin
    .from("attendances")
    .select("status")
    .eq("event_id", eventId)
    .eq("user_id", participant.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.status !== "attending") {
    redirectWithError(eventId, sessionId, "出席者だけを編成・記録に追加できます。", "teams");
  }
}

async function ensureSessionTeamMember(session: MatchSession, participant: ParticipantRef, team: MatchTeam, tab = "live") {
  const admin = createAdminClient();
  let query = admin
    .from("match_session_players")
    .select("team")
    .eq("session_id", session.id)
    .limit(1);

  query = participant.kind === "member" ? query.eq("user_id", participant.id) : query.eq("guest_id", participant.id);
  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.team !== team) {
    redirectWithError(session.event_id, session.id, "選択したチームに所属する選手だけを指定できます。", tab);
  }
}

function ensureTeamEnabled(session: MatchSession, team: MatchTeam, tab = "teams") {
  if (!sessionTeams(session).includes(team)) {
    redirectWithError(session.event_id, session.id, "このセッションでは選択できないチームです。", tab);
  }
}

async function updatePlayerGameStat(
  gameId: string,
  team: MatchTeam,
  participant: ParticipantRef,
  goalsDelta: number,
  assistsDelta: number,
  actorId: string
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("update_match_player_game_stat", {
    p_game_id: gameId,
    p_team: team,
    p_user_id: participant.kind === "member" ? participant.id : null,
    p_guest_id: participant.kind === "guest" ? participant.id : null,
    p_goals_delta: goalsDelta,
    p_assists_delta: assistsDelta,
    p_actor_id: actorId,
  });

  if (error) throw new Error(error.message);
}
async function ensureGameTeamParticipates(gameId: string, team: MatchTeam): Promise<MatchSession> {
  const admin = createAdminClient();
  const { data: game, error } = await admin
    .from("match_games")
    .select("session_id, team_a, team_b")
    .eq("id", gameId)
    .single();

  if (error || !game?.session_id) throw new Error(error?.message ?? "Game not found.");
  const session = await getSession(game.session_id);

  if (!opponentTeam(game, team)) {
    redirectWithError(session.event_id, session.id, "この試合に参加しているチームだけ指定できます。", "live");
  }

  return session;
}

export async function createMatchSessionAction(formData: FormData) {
  const eventId = getString(formData, "event_id");
  const teamCount = parseTeamCount(getString(formData, "team_count"));
  const currentUser = await requireMatchEditor(eventId);
  const admin = createAdminClient();

  const { data: latest, error: latestError } = await admin
    .from("match_sessions")
    .select("session_no")
    .eq("event_id", eventId)
    .order("session_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw new Error(latestError.message);

  const { data, error } = await admin
    .from("match_sessions")
    .insert({
      event_id: eventId,
      session_no: (latest?.session_no ?? 0) + 1,
      team_count: teamCount,
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create session.");

  revalidatePath(matchesPath(eventId));
  redirect(matchesPath(eventId, data.id, "teams"));
}

export async function updateMatchSessionTeamCountAction(formData: FormData) {
  const sessionId = getString(formData, "session_id");
  const teamCount = parseTeamCount(getString(formData, "team_count"));
  const { session } = await requireEditableSession(sessionId);
  const admin = createAdminClient();

  const { count: gameCount, error: gameCountError } = await admin
    .from("match_games")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (gameCountError) throw new Error(gameCountError.message);
  if ((gameCount ?? 0) > 0) {
    redirectWithError(session.event_id, sessionId, "試合追加後はチーム数を変更できません。", "teams");
  }

  const { error } = await admin
    .from("match_sessions")
    .update({ team_count: teamCount })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

  if (teamCount === 2) {
    const { error: deleteError } = await admin
      .from("match_session_players")
      .delete()
      .eq("session_id", sessionId)
      .eq("team", "rev3");

    if (deleteError) throw new Error(deleteError.message);
  }

  revalidatePath(matchesPath(session.event_id, sessionId, "teams"));
}

export async function assignSessionPlayerAction(formData: FormData) {
  const sessionId = getString(formData, "session_id");
  const participant = getParticipantRef(formData, "participant_key");
  const team = getString(formData, "team");
  const { session } = await requireEditableSession(sessionId);
  const admin = createAdminClient();

  if (!team) {
    let query = admin
      .from("match_session_players")
      .delete()
      .eq("session_id", sessionId);

    query = participant.kind === "member" ? query.eq("user_id", participant.id) : query.eq("guest_id", participant.id);
    const { error } = await query;

    if (error) throw new Error(error.message);
  } else {
    if (!isMatchTeam(team)) {
      redirectWithError(session.event_id, sessionId, "チーム指定が不正です。", "teams");
    }
    ensureTeamEnabled(session, team, "teams");

    await ensureParticipantCanPlay(session.event_id, participant, sessionId);

    let existingQuery = admin
      .from("match_session_players")
      .select("id")
      .eq("session_id", sessionId)
      .limit(1);

    existingQuery = participant.kind === "member"
      ? existingQuery.eq("user_id", participant.id)
      : existingQuery.eq("guest_id", participant.id);

    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const { error } = existing
      ? await admin.from("match_session_players").update({ team }).eq("id", existing.id)
      : await admin.from("match_session_players").insert({
          session_id: sessionId,
          ...participantColumns(participant),
          team,
        });

    if (error) throw new Error(error.message);
  }

  revalidatePath(matchesPath(session.event_id, sessionId));
}

export async function addMatchGameAction(formData: FormData) {
  const sessionId = getString(formData, "session_id");
  const { session } = await requireEditableSession(sessionId);
  const admin = createAdminClient();

  const { data: latest, error: latestError } = await admin
    .from("match_games")
    .select("game_no")
    .eq("session_id", sessionId)
    .order("game_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw new Error(latestError.message);

  const [defaultTeamA, defaultTeamB] = nextGameTeams(session, latest?.game_no ?? 0);
  const teamA = getString(formData, "team_a") || defaultTeamA;
  const teamB = getString(formData, "team_b") || defaultTeamB;

  if (!isMatchTeam(teamA) || !isMatchTeam(teamB) || teamA === teamB) {
    redirectWithError(session.event_id, sessionId, "対戦チームの指定が不正です。", "live");
  }

  ensureTeamEnabled(session, teamA, "live");
  ensureTeamEnabled(session, teamB, "live");

  const { error } = await admin.from("match_games").insert({
    session_id: sessionId,
    game_no: (latest?.game_no ?? 0) + 1,
    team_a: teamA,
    team_b: teamB,
  });

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, sessionId));
}

export async function deleteMatchSessionAction(formData: FormData) {
  const sessionId = getString(formData, "session_id");
  const { session } = await requireEditableSession(sessionId);
  const admin = createAdminClient();

  const { error } = await admin.from("match_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);

  revalidatePath(matchesPath(session.event_id));
  redirect(matchesPath(session.event_id));
}

export async function deleteMatchGameAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const admin = createAdminClient();

  const { data: game, error: gameError } = await admin
    .from("match_games")
    .select("id, session_id, game_no")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    throw new Error(gameError?.message ?? "Game not found.");
  }

  const { session } = await requireEditableSession(game.session_id);

  const { error } = await admin.rpc("delete_match_game_and_renumber", { p_game_id: gameId });
  if (error) throw new Error(error.message);

  revalidatePath(matchesPath(session.event_id, session.id, "live"));
}

export async function updateMatchGameAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const session = await getGameSession(gameId);
  await requireEditableSession(session.id);
  const rev1Gk = getOptionalParticipantRef(formData, "rev1_gk_key") ?? (getOptionalString(formData, "rev1_gk_id") ? { kind: "member", id: getString(formData, "rev1_gk_id") } as ParticipantRef : null);
  const rev2Gk = getOptionalParticipantRef(formData, "rev2_gk_key") ?? (getOptionalString(formData, "rev2_gk_id") ? { kind: "member", id: getString(formData, "rev2_gk_id") } as ParticipantRef : null);
  const rev3Gk = getOptionalParticipantRef(formData, "rev3_gk_key") ?? (getOptionalString(formData, "rev3_gk_id") ? { kind: "member", id: getString(formData, "rev3_gk_id") } as ParticipantRef : null);

  if (rev1Gk) await ensureSessionTeamMember(session, rev1Gk, "rev1");
  if (rev2Gk) await ensureSessionTeamMember(session, rev2Gk, "rev2");
  if (rev3Gk) await ensureSessionTeamMember(session, rev3Gk, "rev3");

  const admin = createAdminClient();
  const { error } = await admin
    .from("match_games")
    .update({
      rev1_gk_id: rev1Gk?.kind === "member" ? rev1Gk.id : null,
      rev1_gk_guest_id: rev1Gk?.kind === "guest" ? rev1Gk.id : null,
      rev2_gk_id: rev2Gk?.kind === "member" ? rev2Gk.id : null,
      rev2_gk_guest_id: rev2Gk?.kind === "guest" ? rev2Gk.id : null,
      rev3_gk_id: rev3Gk?.kind === "member" ? rev3Gk.id : null,
      rev3_gk_guest_id: rev3Gk?.kind === "guest" ? rev3Gk.id : null,
    })
    .eq("id", gameId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function updateMatchGameGkAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const team = getString(formData, "team");
  const gk = getOptionalParticipantRef(formData, "gk_key") ?? (getOptionalString(formData, "gk_id") ? { kind: "member", id: getString(formData, "gk_id") } as ParticipantRef : null);

  if (!isMatchTeam(team)) throw new Error("Invalid team.");

  const session = await getGameSession(gameId);
  await requireEditableSession(session.id);
  ensureTeamEnabled(session, team, "live");
  await ensureGameTeamParticipates(gameId, team);
  if (gk) await ensureSessionTeamMember(session, gk, team);

  const admin = createAdminClient();
  const update =
    team === "rev1"
      ? {
          rev1_gk_id: gk?.kind === "member" ? gk.id : null,
          rev1_gk_guest_id: gk?.kind === "guest" ? gk.id : null,
        }
      : team === "rev2"
        ? {
            rev2_gk_id: gk?.kind === "member" ? gk.id : null,
            rev2_gk_guest_id: gk?.kind === "guest" ? gk.id : null,
          }
        : {
            rev3_gk_id: gk?.kind === "member" ? gk.id : null,
            rev3_gk_guest_id: gk?.kind === "guest" ? gk.id : null,
          };
  const { error } = await admin.from("match_games").update(update).eq("id", gameId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function addGoalRecordAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const team = getString(formData, "team");
  const scorer = getParticipantRef(formData, "scorer_key");

  if (!isMatchTeam(team)) throw new Error("Invalid team.");

  const session = await ensureGameTeamParticipates(gameId, team);
  const { currentUser } = await requireEditableSession(session.id);
  await ensureGameGksSet(gameId);
  await ensureSessionTeamMember(session, scorer, team);
  await updatePlayerGameStat(gameId, team, scorer, 1, 0, currentUser.id);

  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function addAssistRecordAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const team = getString(formData, "team");
  const assist = getParticipantRef(formData, "assist_key");

  if (!isMatchTeam(team)) throw new Error("Invalid team.");

  const session = await ensureGameTeamParticipates(gameId, team);
  const { currentUser } = await requireEditableSession(session.id);
  await ensureGameGksSet(gameId);
  await ensureSessionTeamMember(session, assist, team);
  await updatePlayerGameStat(gameId, team, assist, 0, 1, currentUser.id);

  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function cancelLatestPlayerStatRecordAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const team = getString(formData, "team");
  const stat = getMatchStatKind(formData);
  const participant = getParticipantRef(formData, "participant_key");

  if (!isMatchTeam(team)) throw new Error("Invalid team.");

  const session = await ensureGameTeamParticipates(gameId, team);
  const { currentUser } = await requireEditableSession(session.id);
  await ensureSessionTeamMember(session, participant, team);
  await updatePlayerGameStat(gameId, team, participant, stat === "goal" ? -1 : 0, stat === "assist" ? -1 : 0, currentUser.id);

  revalidatePath(matchesPath(session.event_id, session.id));
}
export async function confirmMatchSessionAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const sessionId = getString(formData, "session_id");
  const session = await getSession(sessionId);
  const admin = createAdminClient();

  const [{ count: playerCount }, { count: gameCount }] = await Promise.all([
    admin
      .from("match_session_players")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
    admin
      .from("match_games")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
  ]);

  if ((playerCount ?? 0) === 0 || (gameCount ?? 0) === 0) {
    redirectWithError(session.event_id, sessionId, "編成と試合を登録してから確定してください。", "stats");
  }

  const { error } = await admin
    .from("match_sessions")
    .update({
      status: "confirmed",
      confirmed_by: currentUser.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, sessionId));
}

export async function reopenMatchSessionAction(formData: FormData) {
  await requireAdmin();
  const sessionId = getString(formData, "session_id");
  const session = await getSession(sessionId);
  const admin = createAdminClient();

  const { error } = await admin
    .from("match_sessions")
    .update({
      status: "draft",
      confirmed_by: null,
      confirmed_at: null,
    })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, sessionId));
}
