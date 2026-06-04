import { EVENT_TYPE_LABELS } from "@/lib/constants";
import type { EventType } from "@/lib/types";

export function EventTypeBadge({ type }: { type: EventType }) {
  const style =
    type === "match"
      ? "border-indigo-200 bg-indigo-50 text-indigo-800"
      : type === "party"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${style}`}>
      {EVENT_TYPE_LABELS[type]}
    </span>
  );
}
