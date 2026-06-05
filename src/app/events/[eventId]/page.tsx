import Link from "next/link";
import { Pencil, Trophy, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AttendanceControls } from "@/components/AttendanceControls";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { deleteEventAction } from "@/lib/actions/events";
import { ATTENDANCE_LABELS, ATTENDANCE_STATUS_OPTIONS, MVP_EVENT_TYPES } from "@/lib/constants";
import { formatEventDateTimeRangeJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { getProfileDisplayName } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, AttendanceStatus, Event, Profile, Season } from "@/lib/types";

type EventDetail = Event & { seasons: Pick<Season, "name"> | null };
type AttendanceWithProfile = Attendance & { profiles: Profile | null };

type EventDetailPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { eventId } = await params;
  const profile = await requireUser();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*, seasons(name)")
    .eq("id", eventId)
    .single();

  if (!event) {
    return (
      <AppShell profile={profile} active="events">
        <div className="card p-6 text-sm text-slate-500">イベントが見つかりません。</div>
      </AppShell>
    );
  }

  const { data: attendances } = await supabase
    .from("attendances")
    .select("*, profiles(*)")
    .eq("event_id", eventId)
    .order("updated_at", { ascending: true });

  const attendanceRows = (attendances ?? []) as AttendanceWithProfile[];
  const myAttendance = attendanceRows.find((row) => row.user_id === profile.id);

  const grouped = {
    attending: attendanceRows.filter((row) => row.status === "attending"),
    absent: attendanceRows.filter((row) => row.status === "absent"),
    tentative: attendanceRows.filter((row) => row.status === "tentative"),
    pending: attendanceRows.filter((row) => row.status === "pending"),
  } satisfies Record<AttendanceStatus, AttendanceWithProfile[]>;

  const eventRow = event as EventDetail;

  return (
    <AppShell profile={profile} active="events">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <EventTypeBadge type={eventRow.event_type} />
            {eventRow.seasons?.name ? <span className="text-sm text-slate-500">{eventRow.seasons.name}</span> : null}
          </div>
          <h1 className="text-xl font-bold text-ink">{eventRow.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatEventDateTimeRangeJst(eventRow.event_date, eventRow.end_date)}
          </p>
          <p className="mt-1 text-sm text-slate-500">{eventRow.location || "場所未設定"}</p>
        </div>
      </div>

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-bold text-slate-700">自分の出欠</h2>
        <AttendanceControls eventId={eventId} currentStatus={myAttendance?.status ?? "pending"} />
      </section>

      {MVP_EVENT_TYPES.includes(eventRow.event_type) ? (
        <Link href={`/mvp/${eventId}`} className="btn-secondary mb-4 w-full">
          <Trophy className="h-4 w-4" />
          MVP投票へ
        </Link>
      ) : null}

      <section className="space-y-3">
        {ATTENDANCE_STATUS_OPTIONS.map((status) => (
          <div className="card p-4" key={status}>
            <h2 className="mb-3 text-sm font-bold text-slate-700">
              {ATTENDANCE_LABELS[status]} {grouped[status].length}人
            </h2>
            <div className="flex flex-wrap gap-2">
              {grouped[status].length === 0 ? (
                <span className="text-sm text-slate-400">該当なし</span>
              ) : (
                grouped[status].map((attendance) => (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700" key={attendance.id}>
                    {attendance.profiles ? getProfileDisplayName(attendance.profiles) : "不明なユーザー"}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </section>

      {profile.role === "admin" ? (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link href={`/events/${eventId}/edit`} className="btn-secondary">
            <Pencil className="h-4 w-4" />
            編集
          </Link>
          <form action={deleteEventAction}>
            <input type="hidden" name="event_id" value={eventId} />
            <button type="submit" className="btn-danger w-full">
              <Trash2 className="h-4 w-4" />
              削除
            </button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
