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
  searchParams?: Promise<{ error?: string; message?: string; voter?: string; edit?: string }>;
};

export default async function MvpVotePage({ params, searchParams }: MvpVotePageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const profile = await requireUser();
  const supabase = await createClient();

  const [{ data: event }, { data: attendees }, { data: myVotes }, { data: myAttendance }] = await Promise.all([
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
  const candidates = attendeeRows.map((user) => ({
    id: user.id,
    name: getProfileDisplayName(user),
  }));
  const { data: allVotes } =
    profile.role === "admin"
      ? await supabase.from("mvp_votes").select("*").eq("event_id", eventId)
      : { data: [] as MvpVote[] };
  const canVote = myAttendance?.status === "attending";
  const mySubmittedVote = ((myVotes ?? []) as MvpVote[]).length > 0;
  const requestedVoterId = query?.voter;
  const isAdminEditMode = profile.role === "admin" && query?.edit === "votes";
  const fallbackAdminVoterId = candidates.find((candidate) => candidate.id === profile.id)?.id ?? candidates[0]?.id ?? "";
  const editableVoterId =
    profile.role === "admin"
      ? candidates.some((candidate) => candidate.id === requestedVoterId)
        ? requestedVoterId ?? ""
        : fallbackAdminVoterId
      : profile.id;
  const editableVoterName = candidates.find((candidate) => candidate.id === editableVoterId)?.name;
  const editableVotes = isAdminEditMode
    ? ((allVotes ?? []) as MvpVote[]).filter((vote) => vote.voter_id === editableVoterId)
    : ((myVotes ?? []) as MvpVote[]);
  const initialSelections: Record<3 | 2 | 1, string[]> = { 3: [], 2: [], 1: [] };
  for (const vote of editableVotes) {
    if ((vote.points === 3 || vote.points === 2 || vote.points === 1) && !initialSelections[vote.points].includes(vote.votee_id)) {
      initialSelections[vote.points].push(vote.votee_id);
    }
  }
  const votedVoterIds = new Set(((allVotes ?? []) as MvpVote[]).map((vote) => vote.voter_id));
  const unvotedCandidates = candidates.filter((candidate) => !votedVoterIds.has(candidate.id));
  const votedAttendeeCount = candidates.length - unvotedCandidates.length;
  const canEditVote = isAdminEditMode ? Boolean(editableVoterId) : canVote && !mySubmittedVote;

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

      {profile.role === "admin" ? (
        <div className="card mb-4 p-4">
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
            <div className="mt-4 border-t border-slate-200 pt-3">
              <Link href={`/mvp/${eventId}?edit=votes&voter=${editableVoterId}`} className="btn-secondary w-full">
                投票結果を修正する
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {isAdminEditMode ? (
        <div className="card mb-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink">投票修正</h2>
              <p className="mt-1 text-xs text-slate-500">修正するメンバーを選択してください。</p>
            </div>
            <Link href={`/mvp/${eventId}`} className="btn-secondary shrink-0">
              戻る
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {candidates.map((candidate) => (
              <Link
                key={candidate.id}
                href={`/mvp/${eventId}?edit=votes&voter=${candidate.id}`}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  candidate.id === editableVoterId
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-primary-light/60 hover:text-primary-hover"
                }`}
              >
                {candidate.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {canEditVote ? (
        <MvpVoteForm
          key={`${isAdminEditMode ? "admin" : "self"}-${editableVoterId}`}
          eventId={eventId}
          candidates={candidates}
          initialSelections={initialSelections}
          voterId={isAdminEditMode ? editableVoterId : undefined}
          title={isAdminEditMode && editableVoterName ? `${editableVoterName} の投票を修正` : undefined}
          adminEdit={isAdminEditMode}
        />
      ) : canVote && mySubmittedVote ? (
        <div className="card p-5 text-sm text-slate-600">
          MVP投票は完了済みです。変更が必要な場合は管理者に相談してください。
        </div>
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
