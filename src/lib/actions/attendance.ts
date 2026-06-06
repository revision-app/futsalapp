"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ATTENDANCE_STATUS_OPTIONS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceStatus } from "@/lib/types";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithAttendanceError(eventId: string, message: string): never {
  redirect(`/events/${eventId}?error=${encodeURIComponent(message)}`);
}

export async function setAttendanceAction(formData: FormData) {
  const currentUser = await requireUser();
  const eventId = getString(formData, "event_id");
  const status = getString(formData, "status") as AttendanceStatus;
  const admin = createAdminClient();

  if (!ATTENDANCE_STATUS_OPTIONS.includes(status)) {
    redirectWithAttendanceError(eventId, "出欠ステータスを確認してください。");
  }

  if (status !== "attending") {
    const { count, error: conflictError } = await admin
      .from("mvp_votes")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .or(`voter_id.eq.${currentUser.id},votee_id.eq.${currentUser.id}`);

    if (conflictError) throw new Error(conflictError.message);

    if ((count ?? 0) > 0) {
      redirectWithAttendanceError(
        eventId,
        "MVP投票済み、または投票対象になっているため、出席以外へ変更できません。管理者に相談してください。"
      );
    }
  }

  const { error } = await admin.from("attendances").upsert(
    {
      event_id: eventId,
      user_id: currentUser.id,
      status,
    },
    { onConflict: "event_id,user_id" }
  );

  if (error) throw new Error(error.message);

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/mvp/${eventId}`);
  revalidatePath(`/mvp/${eventId}/results`);
}
