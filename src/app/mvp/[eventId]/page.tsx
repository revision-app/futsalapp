import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { MvpVoteForm } from "@/components/MvpVoteForm";
import { Notice } from "@/components/Notice";
import { closeMvpVotingAction } from "@/lib/actions/mvp";
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
  const isVotingClosed = Boolean(eventRow.mvp_voting_closed_at);
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
  const { data: allVotes } =
    profile.role === "admin"
      ? await supabase.from("mvp_votes").select("voter_id").eq("event_id", eventId)
      : { data: [] as Pick<MvpVote, "voter_id">[] };
  const canVote = myAttendance?.status === "attending";
  const initialSelections: Record<3 | 2 | 1, string[]> = { 3: [], 2: [], 1: [] };
  for (const vote of (votes ?? []) as MvpVote[]) {
    if ((vote.points === 3 || vote.points === 2 || vote.points === 1) && !initialSelections[vote.points].includes(vote.votee_id)) {
      initialSelections[vote.points].push(vote.votee_id);
    }
  }
  const candidates = attendeeRows.map((user) => ({
    id: user.id,
    name: getProfileDisplayName(user),
  }));
  const votedVoterIds = new Set((allVotes ?? []).map((vote) => vote.voter_id));
  const unvotedCandidates = candidates.filter((candidate) => !votedVoterIds.has(candidate.id));
  const votedAttendeeCount = candidates.length - unvotedCandidates.length;

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

      {profile.role === "admin" && !isVotingClosed ? (
        <form action={closeMvpVotingAction} className="card mb-4 p-4">
          <input type="hidden" name="event_id" value={eventId} />
          <div className="mb-4">
            <h2 className="text-sm font-bold text-ink">投票状況</h2>
            <p className="mt-1 text-sm text-slate-600">
              出席者 {candidates.length}人 / 投票済み {votedAttendeeCount}人 / 未投票 {unvotedCandidates.length}人
            </p>
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="mb-2 text-xs font-semibold text-slate-500">未投票</p>
              {unvotedCandidates.length === 0 ? (
                <p className="text-sm text-slate-600">全員投票済みです。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {unvotedCandidates.map((candidate) => (
                    <span className="rounded-full bg-white px-3 py-1 text-sm text-slate-700" key={candidate.id}>
                      {candidate.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mb-3 border-t border-slate-200 pt-3">
            <h2 className="text-sm font-bold text-ink">投票締切</h2>
            <p className="mt-1 text-xs text-slate-500">締切後は投票の追加・変更ができなくなり、結果を表示します。</p>
          </div>
          <button type="submit" className="btn-primary w-full">
            投票を締め切る
          </button>
        </form>
      ) : null}

      {isVotingClosed ? (
        <div className="card p-5 text-sm text-slate-600">
          MVP投票は締め切られています。
          {profile.role === "admin" ? (
            <Link href={`/mvp/${eventId}/results`} className="btn-secondary mt-4 w-full">
              結果を見る
            </Link>
          ) : null}
        </div>
      ) : canVote ? (
        <MvpVoteForm eventId={eventId} candidates={candidates} initialSelections={initialSelections} />
      ) : (
        <div className="card p-5 text-sm text-slate-600">
          MVP投票は出席者のみ可能です。出席に変更する場合は、イベント詳細で出欠を更新してください。
          <Link href={`/events/${eventId}`} className="btn-secondary mt-4 w-full">
            イベント詳細へ
          </Link>
        </div>
      )}

    </AppShell>
  );
}
