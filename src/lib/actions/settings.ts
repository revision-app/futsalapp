"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** 個人成績タブを一般メンバーに表示するかを切り替える */
export async function setStatsVisibilityAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const visible = getString(formData, "visible") === "true";
  const admin = createAdminClient();

  const { error } = await admin
    .from("app_settings")
    .upsert({ id: true, stats_visible_to_members: visible, updated_by: currentUser.id });

  if (error) throw new Error(error.message);

  // 下部ナビはすべての画面に出るので、全体を再描画させる
  revalidatePath("/", "layout");
}
