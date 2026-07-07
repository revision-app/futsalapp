"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
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
  const targetVoterId = getString(formData, "voter_id") || currentUser.id;
  const isAdminEdit = currentUser.role === "admin" && getString(formData, "admin_edit") === "1";
  const admin = createAdminClient();

  if (targetVoterId !== currentUser.id && !isAdminEdit) {
    redirectWithMvpError(eventId, "他のメンバーのMVP投票は変更できません。");
  }

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

  const [{ data: event }, { data: targetAttendance }, { data: existingVotes, error: existingVotesError }] = await Promise.all([
    admin.from("events").select("event_type").eq("id", eventId).single(),
    admin
      .from("attendances")
      .select("status")
      .eq("event_id", eventId)
      .eq("user_id", targetVoterId)
      .maybeSingle(),
    admin
      .from("mvp_votes")
      .select("id")
      .eq("event_id", eventId)
      .eq("voter_id", targetVoterId)
      .limit(1),
  ]);

  if (existingVotesError) throw new Error(existingVotesError.message);

  if (!event || !MVP_EVENT_TYPES.includes(event.event_type as EventType)) {
    redirectWithMvpError(eventId, "このイベントはMVP投票の対象外です。");
  }


  if (targetAttendance?.status !== "attending") {
    redirectWithMvpError(eventId, "MVP投票は出席者のみ可能です。");
  }

  if (!isAdminEdit && (existingVotes?.length ?? 0) > 0) {
    redirectWithMvpError(eventId, "MVP投票は完了済みです。変更が必要な場合は管理者に相談してください。");
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
    .eq("voter_id", targetVoterId);

  if (deleteError) throw new Error(deleteError.message);

  const { error } = await admin.from("mvp_votes").insert(
    selections.map((row) => ({
      event_id: eventId,
      voter_id: targetVoterId,
      votee_id: row.votee_id,
      points: row.points,
    }))
  );

  if (error) throw new Error(error.message);

  revalidatePath(`/mvp/${eventId}`);
  revalidatePath(`/mvp/${eventId}/results`);

  const params = new URLSearchParams({ message: "投票完了しました！" });
  if (isAdminEdit) {
    params.set("edit", "votes");
    params.set("voter", targetVoterId);
  }
  redirect(`/mvp/${eventId}?${params.toString()}`);
}

