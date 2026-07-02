"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { MVP_EVENT_TYPES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/types";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getStrings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function redirectWithMvpError(eventId: string, message: string): never {
  redirect(`/mvp/${eventId}?error=${encodeURIComponent(message)}`);
}

export async function submitMvpVoteAction(formData: FormData) {
  const currentUser = await requireUser();
  const eventId = getString(formData, "event_id");
  const admin = createAdminClient();
  const selections = [3, 2, 1].flatMap((points) => {
    const voteeIds = getStrings(formData, `votee_${points}`);

    return voteeIds.map((voteeId) => ({
      points,
      votee_id: voteeId,
    }));
  });

  if (selections.length === 0) {
    redirectWithMvpError(eventId, "1件以上投票してください。");
  }

  const uniqueVotees = new Set(selections.map((row) => row.votee_id));
  if (uniqueVotees.size !== selections.length) {
    redirectWithMvpError(eventId, "同じ人に複数のポイントを投票することはできません。");
  }

  const [{ data: event }, { data: myAttendance }] = await Promise.all([
    admin.from("events").select("event_type, mvp_voting_closed_at").eq("id", eventId).single(),
    admin
      .from("attendances")
      .select("status")
      .eq("event_id", eventId)
      .eq("user_id", currentUser.id)
      .maybeSingle(),
  ]);

  if (!event || !MVP_EVENT_TYPES.includes(event.event_type as EventType)) {
    redirectWithMvpError(eventId, "このイベントはMVP投票の対象外です。");
  }

  if (event.mvp_voting_closed_at) {
    redirectWithMvpError(eventId, "MVP投票は締め切られています。");
  }

  if (myAttendance?.status !== "attending") {
    redirectWithMvpError(eventId, "MVP投票は出席者のみ可能です。");
  }

  const selectedVoteeIds = [...uniqueVotees];
  const { data: attendingVotees, error: attendanceError } = await admin
    .from("attendances")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("status", "attending")
    .in("user_id", selectedVoteeIds);

  if (attendanceError) throw new Error(attendanceError.message);

  const attendingVoteeIds = new Set((attendingVotees ?? []).map((row) => row.user_id));
  if (selectedVoteeIds.some((voteeId) => !attendingVoteeIds.has(voteeId))) {
    redirectWithMvpError(eventId, "MVP投票は出席者にのみ可能です。");
  }

  const { error: deleteError } = await admin
    .from("mvp_votes")
    .delete()
    .eq("event_id", eventId)
    .eq("voter_id", currentUser.id);

  if (deleteError) throw new Error(deleteError.message);

  const { error } = await admin.from("mvp_votes").insert(
    selections.map((row) => ({
      event_id: eventId,
      voter_id: currentUser.id,
      votee_id: row.votee_id,
      points: row.points,
    }))
  );

  if (error) throw new Error(error.message);

  revalidatePath(`/mvp/${eventId}`);
  revalidatePath(`/mvp/${eventId}/results`);
  redirect(`/mvp/${eventId}?message=${encodeURIComponent("投票完了しました！")}`);
}

export async function closeMvpVotingAction(formData: FormData) {
  await requireAdmin();
  const eventId = getString(formData, "event_id");
  const admin = createAdminClient();

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("event_type, mvp_voting_closed_at")
    .eq("id", eventId)
    .single();

  if (eventError) throw new Error(eventError.message);

  if (!event || !MVP_EVENT_TYPES.includes(event.event_type as EventType)) {
    redirectWithMvpError(eventId, "このイベントはMVP投票の対象外です。");
  }

  if (!event.mvp_voting_closed_at) {
    const { error } = await admin
      .from("events")
      .update({ mvp_voting_closed_at: new Date().toISOString() })
      .eq("id", eventId);

    if (error) throw new Error(error.message);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/mvp/${eventId}`);
  revalidatePath(`/mvp/${eventId}/results`);
  redirect(`/mvp/${eventId}/results?message=${encodeURIComponent("MVP投票を締め切りました。")}`);
}
