"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getStrings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export async function submitMvpVoteAction(formData: FormData) {
  const currentUser = await requireUser();
  const eventId = getString(formData, "event_id");
  const selections = [3, 2, 1]
    .flatMap((points) =>
      getStrings(formData, `votee_${points}`).map((voteeId) => ({
        points,
        votee_id: voteeId,
      }))
    );

  if (selections.length === 0) {
    throw new Error("1件以上投票してください。");
  }

  const uniqueVotees = new Set(selections.map((row) => row.votee_id));
  if (uniqueVotees.size !== selections.length) {
    throw new Error("同じ人に複数のポイントを投票することはできません。");
  }

  const admin = createAdminClient();
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
  redirect(currentUser.role === "admin" ? `/mvp/${eventId}/results` : `/mvp/${eventId}`);
}
