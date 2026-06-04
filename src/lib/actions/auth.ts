"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createRecoveryAnswerHash, verifyRecoveryAnswer } from "@/lib/recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function loginAction(formData: FormData) {
  const email = getString(formData, "email");
  const password = getString(formData, "password");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      redirectWithError(
        "/login",
        "このアカウントはまだログインできる状態ではありません。管理者に確認してください。"
      );
    }
    redirectWithError("/login", "メールアドレスまたはパスワードが正しくありません");
  }

  const profile = await requireUser({ allowPasswordSetup: true });
  if (profile.must_change_password) {
    redirect("/initial-setup");
  }

  redirect("/events");
}

export async function registerAction(formData: FormData) {
  void formData;
  redirectWithError("/login", "アカウント登録は管理者に依頼してください");
}

export async function findRecoveryQuestionAction(formData: FormData) {
  const email = getString(formData, "email");
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("email,recovery_question")
    .eq("email", email)
    .maybeSingle();

  if (!data?.recovery_question) {
    redirectWithError("/forgot-password", "復旧用の質問が未設定です。管理者に初期化を依頼してください");
  }

  redirect(`/forgot-password?email=${encodeURIComponent(email)}`);
}

export async function resetPasswordWithRecoveryAction(formData: FormData) {
  const email = getString(formData, "email");
  const answer = getString(formData, "recovery_answer");
  const password = getString(formData, "password");
  const confirm = getString(formData, "password_confirm");

  if (password.length < 8 || password !== confirm) {
    redirectWithError(
      `/forgot-password?email=${encodeURIComponent(email)}`,
      "パスワードは8文字以上で、確認欄と一致させてください"
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id,recovery_answer_salt,recovery_answer_hash")
    .eq("email", email)
    .maybeSingle();

  if (!profile?.recovery_answer_salt || !profile.recovery_answer_hash) {
    redirectWithError("/forgot-password", "復旧用の質問が未設定です。管理者に初期化を依頼してください");
  }

  const ok = verifyRecoveryAnswer(answer, profile.recovery_answer_salt, profile.recovery_answer_hash);
  if (!ok) {
    redirectWithError(`/forgot-password?email=${encodeURIComponent(email)}`, "復旧用の答えが正しくありません");
  }

  const { error } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (error) {
    redirectWithError(`/forgot-password?email=${encodeURIComponent(email)}`, "パスワードを更新できませんでした");
  }

  await admin.from("profiles").update({ must_change_password: false }).eq("id", profile.id);

  redirect(`/login?message=${encodeURIComponent("パスワードを更新しました。新しいパスワードでログインしてください")}`);
}

export async function updatePasswordAction(formData: FormData) {
  const password = getString(formData, "password");
  const confirm = getString(formData, "password_confirm");

  if (password.length < 8 || password !== confirm) {
    redirectWithError("/reset-password", "パスワードは8文字以上で、確認欄と一致させてください");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirectWithError("/reset-password", "パスワードを更新できませんでした。リンクを再発行してください");
  }

  redirect("/events");
}

export async function completeInitialSetupAction(formData: FormData) {
  const profile = await requireUser({ allowPasswordSetup: true });
  const password = getString(formData, "password");
  const confirm = getString(formData, "password_confirm");
  const question = getString(formData, "recovery_question");
  const answer = getString(formData, "recovery_answer");

  if (password.length < 8 || password !== confirm) {
    redirectWithError("/initial-setup", "パスワードは8文字以上で、確認欄と一致させてください");
  }

  if (question.length < 4 || answer.length < 2) {
    redirectWithError("/initial-setup", "復旧用の質問と答えを入力してください");
  }

  const supabase = await createClient();
  const { error: passwordError } = await supabase.auth.updateUser({ password });

  if (passwordError) {
    redirectWithError("/initial-setup", "パスワードを更新できませんでした");
  }

  const { salt, hash } = createRecoveryAnswerHash(answer);
  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      must_change_password: false,
      recovery_question: question,
      recovery_answer_salt: salt,
      recovery_answer_hash: hash,
    })
    .eq("id", profile.id);

  if (profileError) {
    redirectWithError("/initial-setup", "復旧用の情報を保存できませんでした");
  }

  redirect("/events");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
