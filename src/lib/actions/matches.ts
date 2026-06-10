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

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalString(formData: FormData, key: string): string | null {
  const value = getString(formData, key);
  return value || null;
}

function isMatchTeam(value: string): value is MatchTeam {
  return value === "rev1" || value === "rev2";
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

function participantKey(participant: ParticipantRef): string {
  return `${participant.kind}:${participant.id}`;
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
    .select("rev1_gk_id, rev1_gk_guest_id, rev2_gk_id, rev2_gk_guest_id")
    .eq("id", gameId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Game not found.");

  if ((!data.rev1_gk_id && !data.rev1_gk_guest_id) || (!data.rev2_gk_id && !data.rev2_gk_guest_id)) {
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

export async function createMatchSessionAction(formData: FormData) {
  const eventId = getString(formData, "event_id");
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
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create session.");

  revalidatePath(matchesPath(eventId));
  redirect(matchesPath(eventId, data.id, "teams"));
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

  const { error } = await admin.from("match_games").insert({
    session_id: sessionId,
    game_no: (latest?.game_no ?? 0) + 1,
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

  const { error } = await admin.from("match_games").delete().eq("id", gameId);
  if (error) throw new Error(error.message);

  const { data: laterGames, error: laterGamesError } = await admin
    .from("match_games")
    .select("id, game_no")
    .eq("session_id", game.session_id)
    .gt("game_no", game.game_no)
    .order("game_no", { ascending: true });

  if (laterGamesError) throw new Error(laterGamesError.message);

  for (const laterGame of laterGames ?? []) {
    const { error: updateError } = await admin
      .from("match_games")
      .update({ game_no: laterGame.game_no - 1 })
      .eq("id", laterGame.id);
    if (updateError) throw new Error(updateError.message);
  }

  revalidatePath(matchesPath(session.event_id, session.id, "live"));
}

export async function updateMatchGameAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const session = await getGameSession(gameId);
  await requireEditableSession(session.id);
  const rev1Gk = getOptionalParticipantRef(formData, "rev1_gk_key") ?? (getOptionalString(formData, "rev1_gk_id") ? { kind: "member", id: getString(formData, "rev1_gk_id") } as ParticipantRef : null);
  const rev2Gk = getOptionalParticipantRef(formData, "rev2_gk_key") ?? (getOptionalString(formData, "rev2_gk_id") ? { kind: "member", id: getString(formData, "rev2_gk_id") } as ParticipantRef : null);

  if (rev1Gk) await ensureSessionTeamMember(session, rev1Gk, "rev1");
  if (rev2Gk) await ensureSessionTeamMember(session, rev2Gk, "rev2");

  const admin = createAdminClient();
  const { error } = await admin
    .from("match_games")
    .update({
      rev1_gk_id: rev1Gk?.kind === "member" ? rev1Gk.id : null,
      rev1_gk_guest_id: rev1Gk?.kind === "guest" ? rev1Gk.id : null,
      rev2_gk_id: rev2Gk?.kind === "member" ? rev2Gk.id : null,
      rev2_gk_guest_id: rev2Gk?.kind === "guest" ? rev2Gk.id : null,
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
  if (gk) await ensureSessionTeamMember(session, gk, team);

  const admin = createAdminClient();
  const update =
    team === "rev1"
      ? {
          rev1_gk_id: gk?.kind === "member" ? gk.id : null,
          rev1_gk_guest_id: gk?.kind === "guest" ? gk.id : null,
        }
      : {
          rev2_gk_id: gk?.kind === "member" ? gk.id : null,
          rev2_gk_guest_id: gk?.kind === "guest" ? gk.id : null,
        };
  const { error } = await admin.from("match_games").update(update).eq("id", gameId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function addGoalRecordAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const team = getString(formData, "team");
  const scorer = getParticipantRef(formData, "scorer_key");
  const assist = getOptionalParticipantRef(formData, "assist_key") ?? (getOptionalString(formData, "assist_id") ? { kind: "member", id: getString(formData, "assist_id") } as ParticipantRef : null);

  if (!isMatchTeam(team)) throw new Error("Invalid team.");

  const session = await getGameSession(gameId);
  const { currentUser } = await requireEditableSession(session.id);
  await ensureGameGksSet(gameId);
  await ensureSessionTeamMember(session, scorer, team);
  if (assist) await ensureSessionTeamMember(session, assist, team);

  if (assist && participantKey(assist) === participantKey(scorer)) {
    redirectWithError(session.event_id, session.id, "得点者とアシスト者は別の選手を選んでください。", "live");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("match_goal_records").insert({
    game_id: gameId,
    team,
    scorer_id: scorer.kind === "member" ? scorer.id : null,
    scorer_guest_id: scorer.kind === "guest" ? scorer.id : null,
    assist_id: assist?.kind === "member" ? assist.id : null,
    assist_guest_id: assist?.kind === "guest" ? assist.id : null,
    created_by: currentUser.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function updateGoalRecordAction(formData: FormData) {
  const goalId = getString(formData, "goal_id");
  const scorer = getParticipantRef(formData, "scorer_key");
  const assist = getOptionalParticipantRef(formData, "assist_key") ?? (getOptionalString(formData, "assist_id") ? { kind: "member", id: getString(formData, "assist_id") } as ParticipantRef : null);
  const admin = createAdminClient();

  const { data: goal, error: goalError } = await admin
    .from("match_goal_records")
    .select("*")
    .eq("id", goalId)
    .single();

  if (goalError || !goal) {
    throw new Error(goalError?.message ?? "Goal record not found.");
  }

  const session = await getGameSession(goal.game_id);
  const { currentUser } = await requireEditableSession(session.id);
  const team = goal.team as MatchTeam;

  if (goal.cancelled_at) {
    redirectWithError(session.event_id, session.id, "取消済みの記録は修正できません。", "live");
  }

  await ensureSessionTeamMember(session, scorer, team);
  if (assist) await ensureSessionTeamMember(session, assist, team);

  if (assist && participantKey(assist) === participantKey(scorer)) {
    redirectWithError(session.event_id, session.id, "得点者とアシスト者は別の選手を選んでください。", "live");
  }

  const { error } = await admin
    .from("match_goal_records")
    .update({
      scorer_id: scorer.kind === "member" ? scorer.id : null,
      scorer_guest_id: scorer.kind === "guest" ? scorer.id : null,
      assist_id: assist?.kind === "member" ? assist.id : null,
      assist_guest_id: assist?.kind === "guest" ? assist.id : null,
      updated_by: currentUser.id,
    })
    .eq("id", goalId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function cancelGoalRecordAction(formData: FormData) {
  const goalId = getString(formData, "goal_id");
  const admin = createAdminClient();

  const { data: goal, error: goalError } = await admin
    .from("match_goal_records")
    .select("game_id")
    .eq("id", goalId)
    .single();

  if (goalError || !goal?.game_id) {
    throw new Error(goalError?.message ?? "Goal record not found.");
  }

  const session = await getGameSession(goal.game_id);
  const { currentUser } = await requireEditableSession(session.id);

  const { error } = await admin
    .from("match_goal_records")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: currentUser.id,
    })
    .eq("id", goalId)
    .is("cancelled_at", null);

  if (error) throw new Error(error.message);
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
