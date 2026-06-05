import { EVENT_TYPE_LABELS } from "@/lib/constants";
import type { EventType } from "@/lib/types";

const EVENT_TYPE_STYLES: Record<EventType, string> = {
  practice: "border-emerald-200 bg-emerald-50 text-emerald-800",
  match: "border-emerald-200 bg-emerald-50 text-emerald-800",
  party: "border-amber-200 bg-amber-50 text-amber-800",
  camp: "border-violet-200 bg-violet-50 text-violet-800",
};

export function EventTypeBadge({ type }: { type: EventType }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${EVENT_TYPE_STYLES[type]}`}>
      {EVENT_TYPE_LABELS[type]}
    </span>
  );
}
