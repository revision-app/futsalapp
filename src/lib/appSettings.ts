import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

/** 個人成績タブを一般メンバーに表示するか（管理者が切り替える）。設定が読めないときは表示しない */
export async function getStatsVisibleToMembers(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("stats_visible_to_members").eq("id", true).maybeSingle();
  return data?.stats_visible_to_members ?? false;
}

/** 個人成績タブを見られるか。管理者は常に見られる */
export async function canViewPersonalStats(profile: Pick<Profile, "role">): Promise<boolean> {
  if (profile.role === "admin") return true;
  return getStatsVisibleToMembers();
}
