import Link from "next/link";
import { ClipboardList, Pencil, Trophy, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AttendanceControls } from "@/components/AttendanceControls";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { Notice } from "@/components/Notice";
import { createEventGuestAction, deleteEventAction } from "@/lib/actions/events";
import { ATTENDANCE_LABELS, ATTENDANCE_STATUS_OPTIONS, MVP_EVENT_TYPES } from "@/lib/constants";
import { formatEventDateTimeRangeJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { getProfileDisplayName } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, AttendanceStatus, Event, EventGuest, Profile, Season } from "@/lib/types";

type EventDetail = Event & { seasons: Pick<Season, "name"> | null };
type AttendanceWithProfile = Attendance & { profiles: Profile | null };

type EventDetailPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ error?: string }>;
};

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { eventId } = await params;
  const query = await searchParams;
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

  const { data: guests } = await supabase
    .from("event_guests")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  const eventRow = event as EventDetail;
  const attendanceRows = (attendances ?? []) as AttendanceWithProfile[];
  const guestRows = (guests ?? []) as EventGuest[];
  const myAttendance = attendanceRows.find((row) => row.user_id === profile.id);
  const isMvpEvent = MVP_EVENT_TYPES.includes(eventRow.event_type);
  const isMvpVotingClosed = Boolean(eventRow.mvp_voting_closed_at);
  const canVoteMvp = myAttendance?.status === "attending" && !isMvpVotingClosed;

  const grouped = {
    attending: attendanceRows.filter((row) => row.status === "attending"),
    absent: attendanceRows.filter((row) => row.status === "absent"),
    tentative: attendanceRows.filter((row) => row.status === "tentative"),
    pending: attendanceRows.filter((row) => row.status === "pending"),
  } satisfies Record<AttendanceStatus, AttendanceWithProfile[]>;

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

      <div className="mb-4">
        <Notice error={query?.error} />
      </div>

      <section className="card mb-4 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">この活動で入力するもの</h2>
          <p className="mt-0.5 text-xs text-slate-500">出欠、試合結果、MVP投票はここから入力できます。</p>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink">自分の出欠</h3>
                <p className="text-xs text-slate-500">参加・欠席・保留を登録します。</p>
              </div>
            </div>
            <AttendanceControls eventId={eventId} currentStatus={myAttendance?.status ?? "pending"} />
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink">ゲスト参加者</h3>
                <p className="text-xs text-slate-500">試合結果入力には使えます。MVP投票と年間集計には含めません。</p>
              </div>
            </div>
            {profile.role === "admin" ? (
              <form action={createEventGuestAction} className="mb-3 grid grid-cols-[1fr_auto] gap-2">
                <input type="hidden" name="event_id" value={eventId} />
                <input className="form-input" name="display_name" placeholder="ゲスト名" maxLength={80} required />
                <button type="submit" className="btn-secondary whitespace-nowrap">
                  追加
                </button>
              </form>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {guestRows.length === 0 ? (
                <span className="text-sm text-slate-400">ゲストはまだ追加されていません</span>
              ) : (
                guestRows.map((guest) => (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700" key={guest.id}>
                    {guest.display_name}（ゲスト）
                  </span>
                ))
              )}
            </div>
          </div>

          {isMvpEvent ? (
            <Link
              href={`/events/${eventId}/matches`}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-primary/40 hover:bg-primary-light/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <ClipboardList className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">試合結果を記録</span>
                <span className="block text-xs text-slate-500">セッション編成、ゴール、GKを入力します。</span>
              </span>
            </Link>
          ) : null}

          {isMvpEvent && canVoteMvp ? (
            <Link
              href={`/mvp/${eventId}`}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-primary/40 hover:bg-primary-light/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                <Trophy className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">MVP投票</span>
                <span className="block text-xs text-slate-500">出席者の中からMVPを選びます。</span>
              </span>
            </Link>
          ) : null}

          {isMvpEvent && isMvpVotingClosed ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              MVP投票は締め切られています。
            </div>
          ) : null}

          {isMvpEvent && !isMvpVotingClosed && !canVoteMvp ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              MVP投票は出席者のみ可能です。
            </div>
          ) : null}

          {isMvpEvent && profile.role === "admin" && isMvpVotingClosed ? (
            <Link
              href={`/mvp/${eventId}/results`}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-primary/40 hover:bg-primary-light/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                <Trophy className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">MVP結果を見る</span>
                <span className="block text-xs text-slate-500">管理者用の集計結果を確認します。</span>
              </span>
            </Link>
          ) : null}
        </div>
      </section>

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
