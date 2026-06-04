"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { dateTimeLocalToUtcIso } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventType } from "@/lib/types";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function createPendingAttendances(eventId: string) {
  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("profiles")
    .select("id")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const rows = (members ?? []).map((member) => ({
    event_id: eventId,
    user_id: member.id,
    status: "pending",
  }));

  if (rows.length > 0) {
    const { error: attendanceError } = await admin
      .from("attendances")
      .upsert(rows, { onConflict: "event_id,user_id" });
    if (attendanceError) throw new Error(attendanceError.message);
  }
}

export async function createEventAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("events")
    .insert({
      season_id: getString(formData, "season_id"),
      title: getString(formData, "title"),
      event_type: getString(formData, "event_type") as EventType,
      location: getString(formData, "location"),
      event_date: dateTimeLocalToUtcIso(getString(formData, "event_date")),
      created_by: currentUser.id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create event.");

  await createPendingAttendances(data.id);
  revalidatePath("/events");
  redirect(`/events/${data.id}`);
}

export async function updateEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = getString(formData, "event_id");
  const admin = createAdminClient();

  const { error } = await admin
    .from("events")
    .update({
      season_id: getString(formData, "season_id"),
      title: getString(formData, "title"),
      event_type: getString(formData, "event_type") as EventType,
      location: getString(formData, "location"),
      event_date: dateTimeLocalToUtcIso(getString(formData, "event_date")),
    })
    .eq("id", eventId);

  if (error) throw new Error(error.message);

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

export async function deleteEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = getString(formData, "event_id");
  const admin = createAdminClient();

  const { error } = await admin.from("events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);

  revalidatePath("/events");
  redirect("/events");
}
