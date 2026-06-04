"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createSeasonAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin.from("seasons").insert({
    name: getString(formData, "name"),
    start_date: getString(formData, "start_date"),
    end_date: getString(formData, "end_date"),
    created_by: currentUser.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/seasons");
  redirect("/seasons");
}

export async function updateSeasonAction(formData: FormData) {
  await requireAdmin();
  const seasonId = getString(formData, "season_id");
  const admin = createAdminClient();

  const { error } = await admin
    .from("seasons")
    .update({
      name: getString(formData, "name"),
      start_date: getString(formData, "start_date"),
      end_date: getString(formData, "end_date"),
    })
    .eq("id", seasonId);

  if (error) throw new Error(error.message);

  revalidatePath("/seasons");
  redirect("/seasons");
}
