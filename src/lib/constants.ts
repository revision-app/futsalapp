import type { AttendanceStatus, EventType, FeedbackType } from "@/lib/types";

export const EVENT_TYPE_OPTIONS: EventType[] = ["practice", "party", "camp"];
export const MVP_EVENT_TYPES: EventType[] = ["practice"];
export const ATTENDANCE_STATUS_OPTIONS: AttendanceStatus[] = ["attending", "absent", "tentative", "pending"];
export const FEEDBACK_TYPE_OPTIONS: FeedbackType[] = ["opinion", "request", "bug", "other"];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  practice: "練習",
  match: "練習",
  party: "飲み会",
  camp: "合宿",
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  attending: "出席",
  absent: "欠席",
  tentative: "保留",
  pending: "未回答",
};

export const ATTENDANCE_STYLES: Record<AttendanceStatus, string> = {
  attending: "border-emerald-200 bg-emerald-50 text-emerald-800",
  absent: "border-rose-200 bg-rose-50 text-rose-800",
  tentative: "border-amber-200 bg-amber-50 text-amber-800",
  pending: "border-slate-200 bg-slate-50 text-slate-600",
};

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  opinion: "ご意見",
  request: "ご要望",
  bug: "不具合",
  other: "その他",
};

export const FEEDBACK_TYPE_STYLES: Record<FeedbackType, string> = {
  opinion: "border-sky-200 bg-sky-50 text-sky-800",
  request: "border-emerald-200 bg-emerald-50 text-emerald-800",
  bug: "border-rose-200 bg-rose-50 text-rose-800",
  other: "border-slate-200 bg-slate-50 text-slate-700",
};

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
