import type { AttendanceStatus, EventType } from "@/lib/types";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  practice: "練習",
  match: "試合",
  party: "飲み会",
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  attending: "参加",
  absent: "欠席",
  pending: "未回答",
};

export const ATTENDANCE_STYLES: Record<AttendanceStatus, string> = {
  attending: "border-emerald-200 bg-emerald-50 text-emerald-800",
  absent: "border-rose-200 bg-rose-50 text-rose-800",
  pending: "border-slate-200 bg-slate-50 text-slate-600",
};

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
