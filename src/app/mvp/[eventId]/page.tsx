import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EventTypeBadge } from "@/components/EventTypeBadge";
import { submitMvpVoteAction } from "@/lib/actions/mvp";
import { formatDateTimeJst } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, Event, MvpVote, Profile } from "@/lib/types";

type AttendanceWithProfile = Attendance & { profiles: Profile | null };

type MvpVotePageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function MvpVotePage({ params }: MvpVotePageProps) {
  const { eventId } = await params;
  const profile = await requireUser();
  const supabase = await createClient();

  const [{ data: event }, { data: attendees }, { data: votes }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase
      .from("attendances")
      .select("*, profiles(*)")
      .eq("event_id", eventId)
      .eq("status", "attending"),
    supabase.from("mvp_votes").select("*").eq("event_id", eventId).eq("voter_id", profile.id),
  ]);

  if (!event) {
    return (
      <AppShell profile={profile} active="mvp">
        <div className="card p-6 text-sm text-slate-500">イベントが見つかりません。</div>
      </AppShell>
    );
  }

  const eventRow = event as Event;
  if (eventRow.event_type === "party") {
    return (
      <AppShell profile={profile} active="mvp">
        <div className="card p-6 text-sm text-slate-500">このイベントはMVP投票の対象外です。</div>
      </AppShell>
    );
  }

  const attendeeRows = ((attendees ?? []) as AttendanceWithProfile[])
    .map((attendance) => attendance.profiles)
    .filter(Boolean) as Profile[];
  const myVotes = new Map(((votes ?? []) as MvpVote[]).map((vote) => [vote.points, vote.votee_id]));

  return (
    <AppShell profile={profile} active="mvp">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <EventTypeBadge type={eventRow.event_type} />
          <span className="text-sm text-slate-500">{formatDateTimeJst(eventRow.event_date)}</span>
        </div>
        <h1 className="text-xl font-bold text-ink">MVP投票</h1>
        <p className="mt-1 text-sm text-slate-500">{eventRow.title}</p>
      </div>

      <form action={submitMvpVoteAction} className="card space-y-4 p-4">
        <input type="hidden" name="event_id" value={eventId} />
        {[3, 2, 1].map((points) => (
          <div key={points}>
            <label className="mb-1 block text-sm font-medium text-slate-600">{points}pt</label>
            <select name={`votee_${points}`} defaultValue={myVotes.get(points) ?? ""} className="form-input">
              <option value="">選択なし</option>
              {attendeeRows.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.display_name || user.email}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button type="submit" className="btn-primary w-full">
          投票する
        </button>
      </form>

      <Link href={`/mvp/${eventId}/results`} className="btn-secondary mt-4 w-full">
        結果を見る
      </Link>
    </AppShell>
  );
}
