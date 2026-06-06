import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { Notice } from "@/components/Notice";
import { submitMvpVoteAction } from "@/lib/actions/mvp";
import { MVP_EVENT_TYPES } from "@/lib/constants";
import { formatEventDateTimeRangeJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { getProfileDisplayName } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, Event, MvpVote, Profile } from "@/lib/types";

type AttendanceWithProfile = Attendance & { profiles: Profile | null };

type MvpVotePageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ error?: string }>;
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
  const myVotes = new Map<number, Set<string>>();
  for (const vote of (votes ?? []) as MvpVote[]) {
    const votees = myVotes.get(vote.points) ?? new Set<string>();
    votees.add(vote.votee_id);
    myVotes.set(vote.points, votees);
  }

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
        <Notice error={query?.error} />
      </div>

      {canVote ? (
        <form action={submitMvpVoteAction} className="card space-y-4 p-4">
          <input type="hidden" name="event_id" value={eventId} />
          {[3, 2, 1].map((points) => (
            <fieldset key={points} className="space-y-2">
              <legend className="text-sm font-medium text-slate-600">{points}pt</legend>
              {attendeeRows.length === 0 ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  出席者がいません。
                </p>
              ) : (
                <div className="grid gap-2">
                  {attendeeRows.map((user) => {
                    const inputId = `votee-${points}-${user.id}`;
                    return (
                      <label
                        className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                        htmlFor={inputId}
                        key={user.id}
                      >
                        <input
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                          defaultChecked={myVotes.get(points)?.has(user.id) ?? false}
                          id={inputId}
                          name={`votee_${points}`}
                          type="checkbox"
                          value={user.id}
                        />
                        <span className="min-w-0 flex-1 truncate">{getProfileDisplayName(user)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
          <button type="submit" className="btn-primary w-full">
            投票する
          </button>
        </form>
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
