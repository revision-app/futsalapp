"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { checkSessionSheet, describeSheetProblems, sheetCheckInputFromRows, type SheetCheckInput } from "@/lib/matchStats";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchGame, MatchSession, MatchSessionPlayer, MatchTeam, Profile } from "@/lib/types";

type ParticipantRef = {
  kind: "member" | "guest";
  id: string;
};

/** 転記画面から保存する内容。participant / GK は "member:<id>" / "guest:<id>" のキーで渡す */
export type MatchSheetInput = {
  sessionId: string;
  revision: number;
  players: Array<{ key: string; team: MatchTeam; goals: number; assists: number }>;
  ownGoals: Partial<Record<MatchTeam, number>>;
  games: Array<{
    id: string | null;
    teamA: MatchTeam;
    teamB: MatchTeam;
    scoreA: number | null;
    scoreB: number | null;
    gkA: string | null;
    gkB: string | null;
  }>;
};

export type SaveMatchSheetResult =
  | { ok: true; revision: number }
  | { ok: false; conflict: boolean; message: string };

const MAX_COUNT = 999;
const REVISION_CONFLICT_CODE = "P0409";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
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

function participantColumns(participant: ParticipantRef): { user_id: string | null; guest_id: string | null } {
  return participant.kind === "member"
    ? { user_id: participant.id, guest_id: null }
    : { user_id: null, guest_id: participant.id };
}

function matchesPath(eventId: string, sessionId?: string, tab?: string, displayMode?: string): string {
  const params = new URLSearchParams();
  if (sessionId) params.set("session", sessionId);
  if (tab) params.set("tab", tab);
  if (displayMode === "tablet" || displayMode === "phone") params.set("view", displayMode);
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

function ensureTeamEnabled(session: MatchSession, team: MatchTeam, tab = "teams") {
  if (!sessionTeams(session).includes(team)) {
    redirectWithError(session.event_id, session.id, "このセッションでは選択できないチームです。", tab);
  }
}

async function touchSession(sessionId: string, actorId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("touch_match_session", { p_session_id: sessionId, p_actor_id: actorId });
  if (error) throw new Error(error.message);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;
}

export async function createMatchSessionAction(formData: FormData) {
  const eventId = getString(formData, "event_id");
  const teamCount = parseTeamCount(getString(formData, "team_count"));
  const displayMode = getString(formData, "display_mode");
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
  redirect(matchesPath(eventId, data.id, "teams", displayMode));
}

export async function updateMatchSessionTeamCountAction(formData: FormData) {
  const sessionId = getString(formData, "session_id");
  const teamCount = parseTeamCount(getString(formData, "team_count"));
  const { currentUser, session } = await requireEditableSession(sessionId);
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
    .update({ team_count: teamCount, ...(teamCount === 2 ? { rev3_opponent_own_goals: 0 } : {}) })
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

  await touchSession(sessionId, currentUser.id);
  revalidatePath(matchesPath(session.event_id, sessionId, "teams"));
}

export async function assignSessionPlayerAction(formData: FormData) {
  const sessionId = getString(formData, "session_id");
  const participant = getParticipantRef(formData, "participant_key");
  const team = getString(formData, "team");
  const { currentUser, session } = await requireEditableSession(sessionId);
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

  await touchSession(sessionId, currentUser.id);
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

export async function confirmMatchSessionAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const sessionId = getString(formData, "session_id");
  const session = await getSession(sessionId);
  const admin = createAdminClient();

  const [{ data: players, error: playersError }, { data: games, error: gamesError }] = await Promise.all([
    admin.from("match_session_players").select("*").eq("session_id", sessionId),
    admin.from("match_games").select("*").eq("session_id", sessionId),
  ]);

  if (playersError) throw new Error(playersError.message);
  if (gamesError) throw new Error(gamesError.message);

  const check = checkSessionSheet(
    sheetCheckInputFromRows(session, (players ?? []) as MatchSessionPlayer[], (games ?? []) as MatchGame[])
  );
  if (!check.canConfirm) {
    redirectWithError(session.event_id, sessionId, `確定できません。${describeSheetProblems(check).join(" / ")}`, "stats");
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
  await touchSession(sessionId, currentUser.id);
  revalidatePath(matchesPath(session.event_id, sessionId));
}

export async function reopenMatchSessionAction(formData: FormData) {
  const currentUser = await requireAdmin();
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
  await touchSession(sessionId, currentUser.id);
  revalidatePath(matchesPath(session.event_id, sessionId));
}

function validateSheet(session: MatchSession, input: MatchSheetInput): string | null {
  const teams = sessionTeams(session);
  const seen = new Set<string>();

  for (const player of input.players) {
    try {
      parseParticipantKey(player.key);
    } catch {
      return "選手の指定が不正です。";
    }
    if (seen.has(player.key)) return "同じ選手が2回登録されています。";
    seen.add(player.key);
    if (!teams.includes(player.team)) return "このセッションでは選択できないチームです。";
    if (!isCount(player.goals) || !isCount(player.assists)) return "ゴール数・アシスト数は0以上の整数で入力してください。";
  }

  for (const team of teams) {
    const value = input.ownGoals[team] ?? 0;
    if (!isCount(value)) return "相手OGは0以上の整数で入力してください。";
  }

  const teamByPlayer = new Map(input.players.map((player) => [player.key, player.team]));
  for (const game of input.games) {
    if (!teams.includes(game.teamA) || !teams.includes(game.teamB) || game.teamA === game.teamB) {
      return "対戦チームの指定が不正です。";
    }
    if (session.team_count !== 3 && (game.teamA !== "rev1" || game.teamB !== "rev2")) {
      return "対戦チームの指定が不正です。";
    }
    if ((game.scoreA !== null && !isCount(game.scoreA)) || (game.scoreB !== null && !isCount(game.scoreB))) {
      return "スコアは0以上の整数で入力してください。";
    }
    if ((game.gkA && teamByPlayer.get(game.gkA) !== game.teamA) || (game.gkB && teamByPlayer.get(game.gkB) !== game.teamB)) {
      return "GKはそのチームに編成された選手から選んでください。";
    }
  }

  return null;
}

function toCheckInput(session: MatchSession, input: MatchSheetInput): SheetCheckInput {
  return {
    teams: sessionTeams(session),
    players: input.players.map((player) => ({ key: player.key, team: player.team, goals: player.goals })),
    ownGoals: input.ownGoals,
    games: input.games.map((game, index) => ({ ...game, gameNo: index + 1 })),
  };
}

function gkColumns(key: string | null): { user_id: string | null; guest_id: string | null } {
  return key ? participantColumns(parseParticipantKey(key)) : { user_id: null, guest_id: null };
}

/**
 * 転記画面の内容（編成・試合・ゴール/アシスト・相手OG）をまとめて保存する。
 * 下書きのうちはチェックが通らなくても保存できる。確定済みセッション（管理者のみ）はチェックが通らないと保存できない。
 * 画面を開いた後に他の人が保存していた場合は、上書きせずに conflict を返す。
 */
export async function saveMatchSheetAction(input: MatchSheetInput): Promise<SaveMatchSheetResult> {
  const { currentUser, session } = await requireEditableSession(input.sessionId);

  const invalid = validateSheet(session, input);
  if (invalid) return { ok: false, conflict: false, message: invalid };

  if (session.status === "confirmed") {
    const check = checkSessionSheet(toCheckInput(session, input));
    if (!check.canConfirm) {
      return {
        ok: false,
        conflict: false,
        message: `確定済みのセッションは、チェックが通る内容でしか保存できません。${describeSheetProblems(check).join(" / ")}`,
      };
    }
  }

  const admin = createAdminClient();
  const memberIds = input.players
    .map((player) => parseParticipantKey(player.key))
    .filter((participant) => participant.kind === "member")
    .map((participant) => participant.id);

  if (memberIds.length > 0) {
    const { data: members, error: membersError } = await admin
      .from("profiles")
      .select("id")
      .in("id", memberIds)
      .eq("is_active", true);
    if (membersError) throw new Error(membersError.message);
    if ((members ?? []).length !== memberIds.length) {
      return { ok: false, conflict: false, message: "登録されていないメンバーが含まれています。" };
    }
  }

  const { data: revision, error } = await admin.rpc("save_match_session_sheet", {
    p_session_id: session.id,
    p_expected_revision: input.revision,
    p_actor_id: currentUser.id,
    p_players: input.players.map((player) => ({
      ...participantColumns(parseParticipantKey(player.key)),
      team: player.team,
      goals: player.goals,
      assists: player.assists,
    })),
    p_games: input.games.map((game) => {
      const gkA = gkColumns(game.gkA);
      const gkB = gkColumns(game.gkB);
      return {
        id: game.id,
        team_a: game.teamA,
        team_b: game.teamB,
        score_a: game.scoreA,
        score_b: game.scoreB,
        gk_a_user_id: gkA.user_id,
        gk_a_guest_id: gkA.guest_id,
        gk_b_user_id: gkB.user_id,
        gk_b_guest_id: gkB.guest_id,
      };
    }),
    p_own_goals: input.ownGoals,
  });

  if (error) {
    if (error.code === REVISION_CONFLICT_CODE) {
      return {
        ok: false,
        conflict: true,
        message: "他の人が先に更新しています。画面を再読み込みして、最新の内容を確認してから入力し直してください。",
      };
    }
    return { ok: false, conflict: false, message: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath(matchesPath(session.event_id, session.id));
  revalidatePath(`/events/${session.event_id}`);
  revalidatePath(`/mvp/${session.event_id}`);
  return { ok: true, revision: revision as number };
}
