import { Check, HelpCircle, X } from "lucide-react";
import { setAttendanceAction } from "@/lib/actions/attendance";
import { ATTENDANCE_LABELS } from "@/lib/constants";
import type { AttendanceStatus } from "@/lib/types";

type AttendanceControlsProps = {
  eventId: string;
  currentStatus?: AttendanceStatus;
  compact?: boolean;
};

const options: Array<{ status: AttendanceStatus; icon: React.ReactNode; className: string }> = [
  {
    status: "attending",
    icon: <Check className="h-4 w-4" />,
    className: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  },
  {
    status: "absent",
    icon: <X className="h-4 w-4" />,
    className: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100",
  },
  {
    status: "pending",
    icon: <HelpCircle className="h-4 w-4" />,
    className: "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100",
  },
];

export function AttendanceControls({ eventId, currentStatus, compact = false }: AttendanceControlsProps) {
  return (
    <div className={compact ? "flex gap-1" : "grid grid-cols-3 gap-2"}>
      {options.map((option) => (
        <form action={setAttendanceAction} key={option.status}>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="status" value={option.status} />
          <button
            type="submit"
            className={`inline-flex h-10 w-full items-center justify-center gap-1 rounded-md border px-2 text-sm font-semibold transition ${
              currentStatus === option.status ? option.className : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
            title={ATTENDANCE_LABELS[option.status]}
            aria-label={ATTENDANCE_LABELS[option.status]}
          >
            {option.icon}
            {!compact ? <span>{ATTENDANCE_LABELS[option.status]}</span> : null}
          </button>
        </form>
      ))}
    </div>
  );
}
