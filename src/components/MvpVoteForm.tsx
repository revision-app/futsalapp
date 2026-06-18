"use client";

import { useMemo, useState } from "react";
import { submitMvpVoteAction } from "@/lib/actions/mvp";

type MvpPoint = 3 | 2 | 1;

type MvpVoteCandidate = {
  id: string;
  name: string;
};

type MvpVoteFormProps = {
  eventId: string;
  candidates: MvpVoteCandidate[];
  initialSelections: Record<MvpPoint, string | null>;
};

const MVP_POINT_OPTIONS = [
  { points: 3, symbol: "★", label: "3pt" },
  { points: 2, symbol: "◎", label: "2pt" },
  { points: 1, symbol: "〇", label: "1pt" },
] as const;

function getBlockingReason(
  selections: Record<MvpPoint, string | null>,
  points: MvpPoint,
  candidateId: string
): "point" | "candidate" | null {
  if (selections[points] && selections[points] !== candidateId) return "point";

  const isCandidateSelectedElsewhere = MVP_POINT_OPTIONS.some(
    (option) => option.points !== points && selections[option.points] === candidateId
  );
  return isCandidateSelectedElsewhere ? "candidate" : null;
}

export function MvpVoteForm({ eventId, candidates, initialSelections }: MvpVoteFormProps) {
  const [selections, setSelections] = useState(initialSelections);
  const selectedCount = useMemo(() => Object.values(selections).filter(Boolean).length, [selections]);

  function toggleSelection(points: MvpPoint, candidateId: string) {
    setSelections((current) => {
      if (current[points] === candidateId) {
        return { ...current, [points]: null };
      }

      if (getBlockingReason(current, points, candidateId)) {
        return current;
      }

      return { ...current, [points]: candidateId };
    });
  }

  return (
    <form action={submitMvpVoteAction} className="card overflow-hidden">
      <input type="hidden" name="event_id" value={eventId} />
      {MVP_POINT_OPTIONS.map((option) =>
        selections[option.points] ? (
          <input key={option.points} type="hidden" name={`votee_${option.points}`} value={selections[option.points] ?? ""} />
        ) : null
      )}

      {candidates.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">出席者がいません。</p>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[43%]" />
              <col className="w-[19%]" />
              <col className="w-[19%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-slate-500 sm:px-3">
                  候補者
                </th>
                {MVP_POINT_OPTIONS.map((option) => (
                  <th key={option.points} scope="col" className="px-1 py-3 text-center sm:px-2">
                    <span className="block text-xl leading-none text-ink sm:text-2xl" aria-label={option.label}>
                      {option.symbol}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((candidate) => (
                <tr key={candidate.id} className="bg-white">
                  <th scope="row" className="px-2 py-2 text-left text-sm font-medium text-slate-700 sm:px-3">
                    <span className="block truncate">{candidate.name}</span>
                  </th>
                  {MVP_POINT_OPTIONS.map((option) => {
                    const isSelected = selections[option.points] === candidate.id;
                    const blockingReason = getBlockingReason(selections, option.points, candidate.id);
                    const isDisabled = Boolean(blockingReason);

                    return (
                      <td key={option.points} className="px-1 py-2 text-center sm:px-2">
                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() => toggleSelection(option.points, candidate.id)}
                          aria-pressed={isSelected}
                          aria-label={`${candidate.name}に${option.label}を投票`}
                          title={
                            blockingReason === "point"
                              ? `${option.label}は選択済みです`
                              : blockingReason === "candidate"
                                ? `${candidate.name}は選択済みです`
                                : undefined
                          }
                          className={[
                            "mx-auto flex h-8 w-8 items-center justify-center rounded-md border text-base font-semibold leading-none transition sm:h-10 sm:w-10 sm:text-lg",
                            isSelected
                              ? "border-primary bg-primary text-white shadow-sm shadow-emerald-900/10"
                              : isDisabled
                                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-transparent"
                                : "border-slate-300 bg-white text-transparent hover:border-primary/50 hover:bg-primary-light/40 focus:outline-none focus:ring-2 focus:ring-primary/20",
                          ].join(" ")}
                        >
                          {isSelected ? option.symbol : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-slate-200 bg-white p-4">
        <button
          type="submit"
          className="btn-primary w-full disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          disabled={selectedCount === 0}
        >
          投票する
        </button>
      </div>
    </form>
  );
}
