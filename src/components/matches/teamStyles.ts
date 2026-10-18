import type { MatchTeam } from "@/lib/types";

/** チームカラー（REV1=オレンジ、REV2=赤、REV3=青） */
export const TEAM_STYLES: Record<MatchTeam, { chip: string; text: string; soft: string; button: string; border: string; submit: string }> = {
  rev1: {
    chip: "border-amber-300 bg-amber-50 text-amber-950",
    text: "text-amber-800",
    soft: "bg-amber-50",
    button: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
    border: "border-l-amber-400",
    submit: "bg-amber-500 hover:bg-amber-600",
  },
  rev2: {
    chip: "border-rose-300 bg-rose-50 text-rose-950",
    text: "text-rose-800",
    soft: "bg-rose-50",
    button: "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100",
    border: "border-l-rose-400",
    submit: "bg-rose-500 hover:bg-rose-600",
  },
  rev3: {
    chip: "border-sky-300 bg-sky-50 text-sky-950",
    text: "text-sky-800",
    soft: "bg-sky-50",
    button: "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100",
    border: "border-l-sky-400",
    submit: "bg-sky-500 hover:bg-sky-600",
  },
};
