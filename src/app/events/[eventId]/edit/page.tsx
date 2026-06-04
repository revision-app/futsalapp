import { AppShell } from "@/components/AppShell";
import { updateEventAction } from "@/lib/actions/events";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { utcIsoToDateTimeLocal } from "@/lib/dates";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Event, EventType, Season } from "@/lib/types";

type EditEventPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { eventId } = await params;
  const profile = await requireAdmin();
  const supabase = await createClient();

  const [{ data: event }, { data: seasons }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase.from("seasons").select("*").order("start_date", { ascending: false }),
  ]);

  if (!event) {
    return (
      <AppShell profile={profile} active="events">
        <div className="card p-6 text-sm text-slate-500">イベントが見つかりません。</div>
      </AppShell>
    );
  }

  return (
    <AppShell profile={profile} active="events">
      <h1 className="mb-4 text-xl font-bold text-ink">イベント編集</h1>
      <form action={updateEventAction} className="card space-y-4 p-4">
        <input type="hidden" name="event_id" value={eventId} />
        <EventFields event={event as Event} seasons={(seasons ?? []) as Season[]} />
        <button type="submit" className="btn-primary w-full">
          更新する
        </button>
      </form>
    </AppShell>
  );
}

function EventFields({ event, seasons }: { event: Event; seasons: Season[] }) {
  const eventTypes: EventType[] = ["practice", "match", "party"];

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">シーズン</label>
        <select name="season_id" defaultValue={event.season_id} className="form-input" required>
          {seasons.map((season) => (
            <option value={season.id} key={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">タイトル</label>
        <input name="title" defaultValue={event.title} className="form-input" required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">種別</label>
        <select name="event_type" defaultValue={event.event_type} className="form-input" required>
          {eventTypes.map((type) => (
            <option value={type} key={type}>
              {EVENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">場所</label>
        <input name="location" defaultValue={event.location} className="form-input" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">日時</label>
        <input
          name="event_date"
          type="datetime-local"
          step="900"
          defaultValue={utcIsoToDateTimeLocal(event.event_date)}
          className="form-input"
          required
        />
      </div>
    </>
  );
}
