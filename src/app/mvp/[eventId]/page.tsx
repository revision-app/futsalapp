import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { MvpVoteForm } from "@/components/MvpVoteForm";
import { Notice } from "@/components/Notice";
import { MVP_EVENT_TYPES } from "@/lib/constants";
import { formatEventDateTimeRangeJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { getProfileDisplayName } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, Event, MvpVote, Profile } from "@/lib/types";

type AttendanceWithProfile = Attendance & { profiles: Profile | null };

type MvpVotePageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
};

export default async function MvpVotePage({ params, searchParams }: MvpVotePageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const profile = await requireUser();
  const supabase = await createClient();

  const [{ data: event }, { data: attendees }, { data: votes }, { data: myAttendance }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase
      .from("attendances")
      .select("*, profiles(*)")
      .eq("event_id", eventId)
      .eq("status", "attending"),
    supabase.from("mvp_votes").select("*").eq("event_id", eventId).eq("voter_id", profile.id),
    supabase
      .from("attendances")
      .select("status")
      .eq("event_id", eventId)
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);

  if (!event) {
    return (
      <AppShell profile={profile} active="mvp">
        <div className="card p-6 text-sm text-slate-500">イベントが見つかりません。</div>
      </AppShell>
    );
  }

  const eventRow = event as Event;
  if (!MVP_EVENT_TYPES.includes(eventRow.event_type)) {
    return (
      <AppShell profile={profile} active="mvp">
        <div className="card p-6 text-sm text-slate-500">このイベントはMVP投票の対象外です。</div>
      </AppShell>
    );
  }

  const attendeeRows = ((attendees ?? []) as AttendanceWithProfile[])
    .map((attendance) => attendance.profiles)
    .filter(Boolean) as Profile[];
  const canVote = myAttendance?.status === "attending";
  const initialSelections: Record<3 | 2 | 1, string | null> = { 3: null, 2: null, 1: null };
  for (const vote of (votes ?? []) as MvpVote[]) {
    if ((vote.points === 3 || vote.points === 2 || vote.points === 1) && !initialSelections[vote.points]) {
      initialSelections[vote.points] = vote.votee_id;
    }
  }
  const candidates = attendeeRows.map((user) => ({
    id: user.id,
    name: getProfileDisplayName(user),
  }));

  return (
    <AppShell profile={profile} active="mvp">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <EventTypeBadge type={eventRow.event_type} />
          <span className="text-sm text-slate-500">
            {formatEventDateTimeRangeJst(eventRow.event_date, eventRow.end_date)}
          </span>
        </div>
        <h1 className="text-xl font-bold text-ink">MVP投票</h1>
        <p className="mt-1 text-sm text-slate-500">{eventRow.title}</p>
      </div>

      <div className="mb-4">
        <Notice error={query?.error} message={query?.message} />
      </div>

      {canVote ? (
        <MvpVoteForm eventId={eventId} candidates={candidates} initialSelections={initialSelections} />
      ) : (
        <div className="card p-5 text-sm text-slate-600">
          MVP投票は出席者のみ可能です。出席に変更する場合は、イベント詳細で出欠を更新してください。
          <Link href={`/events/${eventId}`} className="btn-secondary mt-4 w-full">
            イベント詳細へ
          </Link>
        </div>
      )}

      {profile.role === "admin" ? (
        <Link href={`/mvp/${eventId}/results`} className="btn-secondary mt-4 w-full">
          結果を見る
        </Link>
      ) : null}
    </AppShell>
  );
}
