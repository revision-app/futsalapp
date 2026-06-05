"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { INITIAL_PASSWORD, loginIdToAuthEmail, normalizeLoginId } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function updateUserRoleAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const userId = getString(formData, "user_id");
  const role = getString(formData, "role");

  if (userId === currentUser.id) {
    throw new Error("自分自身の管理者権限は変更できません。");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function updateUserActiveAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const userId = getString(formData, "user_id");
  const isActive = getString(formData, "is_active") === "true";

  if (userId === currentUser.id) {
    throw new Error("自分自身のアカウントは無効化できません。");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function createUserAction(formData: FormData) {
  await requireAdmin();
  const loginId = normalizeLoginId(getString(formData, "login_id"));
  const email = loginIdToAuthEmail(loginId);
  const displayName = getString(formData, "display_name");
  const role = getString(formData, "role") === "admin" ? "admin" : "member";

  if (!loginId || !displayName) {
    redirect(`/admin/invite?error=${encodeURIComponent("表示名、ログインIDを確認してください")}`);
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: INITIAL_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName, login_id: loginId },
  });

  if (error || !data.user) {
    redirect(`/admin/invite?error=${encodeURIComponent("ユーザーを作成できませんでした。同じログインIDが既にある可能性があります")}`);
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    display_name: displayName,
    login_id: loginId,
    role,
    is_active: true,
    must_change_password: true,
  });

  if (profileError) {
    redirect(`/admin/invite?error=${encodeURIComponent("ユーザーは作成されましたが、プロフィール保存に失敗しました")}`);
  }

  revalidatePath("/admin/users");
  redirect(`/admin/invite?message=${encodeURIComponent(`${displayName} を作成しました。初期パスワードを本人に伝えてください`)}`);
}
