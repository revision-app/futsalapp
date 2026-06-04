import { AppShell } from "@/components/AppShell";
import { createEventAction } from "@/lib/actions/events";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EventType, Season } from "@/lib/types";

export default async function NewEventPage() {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data: seasons } = await supabase
    .from("seasons")
    .select("*")
    .order("start_date", { ascending: false });

  return (
    <AppShell profile={profile} active="events">
      <h1 className="mb-4 text-xl font-bold text-ink">イベント作成</h1>
      <EventForm action={createEventAction} seasons={(seasons ?? []) as Season[]} />
    </AppShell>
  );
}

function EventForm({
  action,
  seasons,
}: {
  action: (formData: FormData) => Promise<void>;
  seasons: Season[];
}) {
  const eventTypes: EventType[] = ["practice", "match", "party"];

  return (
    <form action={action} className="card space-y-4 p-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">シーズン</label>
        <select name="season_id" className="form-input" required>
          {seasons.map((season) => (
            <option value={season.id} key={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">タイトル</label>
        <input name="title" className="form-input" required />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">種別</label>
        <select name="event_type" className="form-input" required>
          {eventTypes.map((type) => (
            <option value={type} key={type}>
              {EVENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">場所</label>
        <input name="location" className="form-input" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">日時</label>
        <input name="event_date" type="datetime-local" step="900" className="form-input" required />
      </div>
      <button type="submit" className="btn-primary w-full">
        作成する
      </button>
    </form>
  );
}
