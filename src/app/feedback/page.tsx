import { MessageSquareText, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Notice } from "@/components/Notice";
import { createFeedbackAction } from "@/lib/actions/feedback";
import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPE_OPTIONS,
  FEEDBACK_TYPE_STYLES,
} from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { formatDateTimeJst } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { FeedbackItem, Profile } from "@/lib/types";

type FeedbackWithProfile = FeedbackItem & {
  profiles: Pick<Profile, "display_name" | "login_id" | "member_no" | "uniform_no" | "email"> | null;
};

type FeedbackPageProps = {
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const profile = await requireUser();
  const params = await searchParams;
  const supabase = await createClient();

  let feedbackQuery = supabase
    .from("feedback_items")
    .select("*, profiles(display_name, login_id, member_no, uniform_no, email)")
    .order("created_at", { ascending: false });

  if (profile.role !== "admin") {
    feedbackQuery = feedbackQuery.eq("user_id", profile.id);
  }

  const { data: feedbackItems } = await feedbackQuery;
  const rows = (feedbackItems ?? []) as FeedbackWithProfile[];

  return (
    <AppShell profile={profile} active="feedback">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-ink">ご意見・ご要望</h1>
        <p className="text-sm text-slate-500">
          ユーザーテスト中に気づいたことを残せます
        </p>
      </div>

      <div className="mb-4">
        <Notice error={params?.error} message={params?.message} />
      </div>

      <form action={createFeedbackAction} className="card space-y-4 p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">種別</label>
          <select name="feedback_type" className="form-input" required>
            {FEEDBACK_TYPE_OPTIONS.map((type) => (
              <option value={type} key={type}>
                {FEEDBACK_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">件名</label>
          <input
            name="title"
            maxLength={120}
            className="form-input"
            placeholder="例: 出欠ボタンの位置について"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">内容</label>
          <textarea
            name="body"
            rows={6}
            maxLength={2000}
            className="form-input min-h-36 resize-y"
            placeholder="気づいたこと、困ったこと、追加してほしいこと"
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          <Send className="h-4 w-4" />
          投稿する
        </button>
      </form>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-ink">
            {profile.role === "admin" ? "投稿一覧" : "自分の投稿"}
          </h2>
        </div>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="card p-6 text-center text-sm text-slate-500">
              まだ投稿はありません。
            </div>
          ) : (
            rows.map((item) => (
              <article className="card p-4" key={item.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${FEEDBACK_TYPE_STYLES[item.feedback_type]}`}
                  >
                    {FEEDBACK_TYPE_LABELS[item.feedback_type]}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTimeJst(item.created_at)}
                  </span>
                </div>
                <h3 className="break-words font-bold text-ink">
                  {item.title || "件名なし"}
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {item.body}
                </p>
                {profile.role === "admin" ? (
                  <p className="mt-3 text-xs text-slate-500">
                    投稿者:{" "}
                    {item.profiles ? getFeedbackAuthorName(item.profiles) : "不明なユーザー"}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function getFeedbackAuthorName(
  profile: Pick<Profile, "display_name" | "login_id" | "member_no" | "uniform_no" | "email">
): string {
  const loginId = profile.login_id || profile.email.split("@")[0] || "";
  const displayName = profile.display_name || loginId || "名前未設定";
  const memberInfo = [
    profile.member_no ? `No.${profile.member_no}` : null,
    profile.uniform_no ? `背番号 ${profile.uniform_no}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return [displayName, loginId, memberInfo]
    .filter(Boolean)
    .join(" / ");
}
