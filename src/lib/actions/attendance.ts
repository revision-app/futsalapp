"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceStatus } from "@/lib/types";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function setAttendanceAction(formData: FormData) {
  const currentUser = await requireUser();
  const eventId = getString(formData, "event_id");
  const status = getString(formData, "status") as AttendanceStatus;
  const admin = createAdminClient();

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
}
