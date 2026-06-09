"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchSession, MatchTeam, Profile } from "@/lib/types";

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

async function ensureUserIsAttending(eventId: string, userId: string, sessionId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("attendances")
    .select("status")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.status !== "attending") {
    redirectWithError(eventId, sessionId, "出席者だけを編成・記録に追加できます。", "teams");
  }
}

async function ensureSessionTeamMember(session: MatchSession, userId: string, team: MatchTeam, tab = "live") {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("match_session_players")
    .select("team")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .maybeSingle();

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
  const userId = getString(formData, "user_id");
  const team = getString(formData, "team");
  const { session } = await requireEditableSession(sessionId);
  const admin = createAdminClient();

  if (!team) {
    const { error } = await admin
      .from("match_session_players")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
  } else {
    if (!isMatchTeam(team)) {
      redirectWithError(session.event_id, sessionId, "チーム指定が不正です。", "teams");
    }

    await ensureUserIsAttending(session.event_id, userId, sessionId);
    const { error } = await admin.from("match_session_players").upsert(
      {
        session_id: sessionId,
        user_id: userId,
        team,
      },
      { onConflict: "session_id,user_id" }
    );

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

export async function updateMatchGameAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const session = await getGameSession(gameId);
  await requireEditableSession(session.id);
  const rev1GkId = getOptionalString(formData, "rev1_gk_id");
  const rev2GkId = getOptionalString(formData, "rev2_gk_id");

  if (rev1GkId) await ensureSessionTeamMember(session, rev1GkId, "rev1");
  if (rev2GkId) await ensureSessionTeamMember(session, rev2GkId, "rev2");

  const admin = createAdminClient();
  const { error } = await admin
    .from("match_games")
    .update({
      rev1_gk_id: rev1GkId,
      rev2_gk_id: rev2GkId,
    })
    .eq("id", gameId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function updateMatchGameGkAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const team = getString(formData, "team");
  const gkId = getOptionalString(formData, "gk_id");

  if (!isMatchTeam(team)) throw new Error("Invalid team.");

  const session = await getGameSession(gameId);
  await requireEditableSession(session.id);
  if (gkId) await ensureSessionTeamMember(session, gkId, team);

  const admin = createAdminClient();
  const update = team === "rev1" ? { rev1_gk_id: gkId } : { rev2_gk_id: gkId };
  const { error } = await admin.from("match_games").update(update).eq("id", gameId);

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function addGoalRecordAction(formData: FormData) {
  const gameId = getString(formData, "game_id");
  const team = getString(formData, "team");
  const scorerId = getString(formData, "scorer_id");
  const assistId = getOptionalString(formData, "assist_id");

  if (!isMatchTeam(team)) throw new Error("Invalid team.");

  const session = await getGameSession(gameId);
  const { currentUser } = await requireEditableSession(session.id);
  await ensureSessionTeamMember(session, scorerId, team);
  if (assistId) await ensureSessionTeamMember(session, assistId, team);

  if (assistId && assistId === scorerId) {
    redirectWithError(session.event_id, session.id, "得点者とアシスト者は別の選手を選んでください。", "live");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("match_goal_records").insert({
    game_id: gameId,
    team,
    scorer_id: scorerId,
    assist_id: assistId,
    created_by: currentUser.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(matchesPath(session.event_id, session.id));
}

export async function updateGoalRecordAction(formData: FormData) {
  const goalId = getString(formData, "goal_id");
  const scorerId = getString(formData, "scorer_id");
  const assistId = getOptionalString(formData, "assist_id");
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

  await ensureSessionTeamMember(session, scorerId, team);
  if (assistId) await ensureSessionTeamMember(session, assistId, team);

  if (assistId && assistId === scorerId) {
    redirectWithError(session.event_id, session.id, "得点者とアシスト者は別の選手を選んでください。", "live");
  }

  const { error } = await admin
    .from("match_goal_records")
    .update({
      scorer_id: scorerId,
      assist_id: assistId,
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
