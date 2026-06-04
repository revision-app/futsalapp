import { NextResponse } from "next/server";
import { ATTENDANCE_LABELS } from "@/lib/constants";
import { csvEscape, formatDateJst } from "@/lib/dates";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendance, Event, Profile } from "@/lib/types";

type RouteContext = {
  params: Promise<{ seasonId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const { seasonId } = await context.params;
  const admin = createAdminClient();

  const [{ data: events }, { data: users }] = await Promise.all([
    admin.from("events").select("*").eq("season_id", seasonId).order("event_date", { ascending: true }),
    admin.from("profiles").select("*").eq("is_active", true).order("display_name", { ascending: true }),
  ]);

  const eventRows = (events ?? []) as Event[];
  const userRows = (users ?? []) as Profile[];
  const eventIds = eventRows.map((event) => event.id);

  let attendanceRows: Attendance[] = [];
  if (eventIds.length > 0) {
    const { data } = await admin.from("attendances").select("*").in("event_id", eventIds);
    attendanceRows = (data ?? []) as Attendance[];
  }

  const attendanceMap = new Map(
    attendanceRows.map((attendance) => [
      `${attendance.event_id}:${attendance.user_id}`,
      ATTENDANCE_LABELS[attendance.status],
    ])
  );

  const rows = [
    ["ユーザー名", "メールアドレス", ...eventRows.map((event) => `${formatDateJst(event.event_date)} ${event.title}`)],
    ...userRows.map((user) => [
      user.display_name || user.email,
      user.email,
      ...eventRows.map((event) => attendanceMap.get(`${event.id}:${user.id}`) ?? "未登録"),
    ]),
  ];

  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance_${seasonId}.csv"`,
    },
  });
}
