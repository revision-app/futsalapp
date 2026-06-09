import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AttendanceControls } from "@/components/AttendanceControls";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { ATTENDANCE_LABELS, ATTENDANCE_STYLES } from "@/lib/constants";
import { formatEventDateTimeRangeJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, AttendanceStatus, Event, Season } from "@/lib/types";

type EventWithSeason = Event & { seasons: Pick<Season, "name"> | null };

type EventsPageProps = {
  searchParams?: Promise<{ season?: string }>;
};

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const profile = await requireUser();
  const params = (await searchParams) ?? {};
  const selectedSeason = params.season || "";
  const supabase = await createClient();

  const { data: seasons } = await supabase
    .from("seasons")
    .select("*")
    .order("start_date", { ascending: false });

  let eventsQuery = supabase
    .from("events")
    .select("*, seasons(name)")
    .order("event_date", { ascending: true });

  if (selectedSeason) {
    eventsQuery = eventsQuery.eq("season_id", selectedSeason);
  }

  const { data: events } = await eventsQuery;
  const eventRows = (events ?? []) as EventWithSeason[];
  const eventIds = eventRows.map((event) => event.id);

  let attendanceMap = new Map<string, AttendanceStatus>();
  if (eventIds.length > 0) {
    const { data: attendances } = await supabase
      .from("attendances")
      .select("*")
      .eq("user_id", profile.id)
      .in("event_id", eventIds);

    attendanceMap = new Map(
      ((attendances ?? []) as Attendance[]).map((attendance) => [
        attendance.event_id,
        attendance.status,
      ])
    );
  }

  return (
    <AppShell profile={profile} active="events">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">イベント</h1>
          <p className="text-sm text-slate-500">予定と出欠状況</p>
        </div>
        {profile.role === "admin" ? (
          <Link href="/events/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            新規
          </Link>
        ) : null}
      </div>

      <form className="card mb-4 flex gap-2 p-3">
        <select name="season" defaultValue={selectedSeason} className="form-input">
          <option value="">すべてのシーズン</option>
          {((seasons ?? []) as Season[]).map((season) => (
            <option value={season.id} key={season.id}>
              {season.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary shrink-0">
          表示
        </button>
      </form>

      <div className="space-y-3">
        {eventRows.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">イベントがありません。</div>
        ) : (
          eventRows.map((event) => {
            const status = attendanceMap.get(event.id) ?? "pending";
            return (
              <article className="card p-4" key={event.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <EventTypeBadge type={event.event_type} />
                    </div>
                    <Link href={`/events/${event.id}`} className="block truncate text-lg font-bold text-ink hover:text-primary">
                      {event.title}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatEventDateTimeRangeJst(event.event_date, event.end_date)}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">{event.location || "場所未設定"}</p>
                    {event.seasons?.name ? (
                      <p className="mt-1 text-xs text-slate-400">{event.seasons.name}</p>
                    ) : null}
                  </div>
                  <Link
                    href={`/events/${event.id}`}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-900/10 transition hover:bg-primary-hover"
                  >
                    詳細・入力へ
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">自分の出欠</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ATTENDANCE_STYLES[status]}`}>
                      {ATTENDANCE_LABELS[status]}
                    </span>
                  </div>
                  <AttendanceControls eventId={event.id} currentStatus={status} compact />
                </div>
              </article>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
