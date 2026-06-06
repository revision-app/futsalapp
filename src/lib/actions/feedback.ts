"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { FEEDBACK_TYPE_OPTIONS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeedbackType } from "@/lib/types";

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 2000;

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createFeedbackAction(formData: FormData) {
  const currentUser = await requireUser();
  const feedbackType = getString(formData, "feedback_type") as FeedbackType;
  const title = getString(formData, "title");
  const body = getString(formData, "body");

  if (!FEEDBACK_TYPE_OPTIONS.includes(feedbackType)) {
    redirect(`/feedback?error=${encodeURIComponent("種別を選択してください")}`);
  }

  if (!body) {
    redirect(`/feedback?error=${encodeURIComponent("内容を入力してください")}`);
  }

  if (title.length > MAX_TITLE_LENGTH || body.length > MAX_BODY_LENGTH) {
    redirect(`/feedback?error=${encodeURIComponent("入力内容が長すぎます")}`);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("feedback_items").insert({
    user_id: currentUser.id,
    feedback_type: feedbackType,
    title,
    body,
  });

  if (error) {
    redirect(`/feedback?error=${encodeURIComponent("投稿できませんでした。時間をおいて再度お試しください")}`);
  }

  revalidatePath("/feedback");
  redirect(`/feedback?message=${encodeURIComponent("投稿しました")}`);
}
