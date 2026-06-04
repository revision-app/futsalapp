import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/constants";
import { sendMail } from "@/lib/email";
import { tomorrowJstUtcRange } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendance, Event, Profile } from "@/lib/types";

type AttendanceWithProfile = Attendance & { profiles: Profile | null };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-cron-secret");

  if (secret && authorization !== `Bearer ${secret}` && cronSecret !== secret) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { start, end } = tomorrowJstUtcRange();

  const { data: events, error } = await admin
    .from("events")
    .select("*")
    .gte("event_date", start)
    .lt("event_date", end)
    .order("event_date", { ascending: true });

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const event of (events ?? []) as Event[]) {
    const { data: attendances } = await admin
      .from("attendances")
      .select("*, profiles(*)")
      .eq("event_id", event.id)
      .eq("status", "pending");

    for (const attendance of (attendances ?? []) as AttendanceWithProfile[]) {
      const user = attendance.profiles;
      if (!user?.is_active) continue;

      const ok = await sendMail({
        to: user.email,
        subject: `【REVISION】明日のイベントリマインド: ${event.title}`,
        html: `
          <p>${user.display_name || user.email} さん</p>
          <p>明日のイベントの出欠が未回答です。</p>
          <p><strong>${event.title}</strong></p>
          <p><a href="${SITE_URL}/events/${event.id}">${SITE_URL}/events/${event.id}</a></p>
        `,
      });
      if (ok) sent += 1;
    }
  }

  return NextResponse.json({ sent });
}
