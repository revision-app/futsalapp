"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Save, X } from "lucide-react";
import { saveMatchSheetAction, type MatchSheetInput } from "@/lib/actions/matches";
import {
  checkSessionSheet,
  compareParticipants,
  describeSheetProblems,
  gameGkKey,
  getGameTeams,
  getOpponentOwnGoals,
  getParticipantDisplayName,
  getParticipantUniformNo,
  matchPlayerKey,
  participantKey,
  TEAM_LABELS,
  type MatchParticipant,
  type MatchPlayer,
  type SheetCheckInput,
} from "@/lib/matchStats";
import type { MatchGame, MatchSession, MatchTeam } from "@/lib/types";
import { TEAM_STYLES } from "@/components/matches/teamStyles";

type SheetPlayer = {
  key: string;
  participant: MatchParticipant;
  team: MatchTeam;
  goals: string;
  assists: string;
};

type SheetGame = {
  rowKey: string;
  id: string | null;
  teamA: MatchTeam;
  teamB: MatchTeam;
  scoreA: string;
  scoreB: string;
  gkA: string;
  gkB: string;
};

type SheetState = {
  players: SheetPlayer[];
  games: SheetGame[];
  ownGoals: Record<MatchTeam, string>;
};

const THREE_TEAM_GAME_SEQUENCE: [MatchTeam, MatchTeam][] = [
  ["rev1", "rev2"],
  ["rev2", "rev3"],
  ["rev3", "rev1"],
];

const REMOVE_VALUE = "__remove__";

function countText(value: number | null): string {
  return value === null || value === 0 ? "" : String(value);
}

/** 入力欄の文字列を数値にする。空欄は null */
function parseCount(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 3);
}

function initialState(session: MatchSession, players: MatchPlayer[], games: MatchGame[]): SheetState {
  return {
    players: players.map((player) => ({
      key: matchPlayerKey(player),
      participant: player.participant,
      team: player.team,
      goals: countText(player.goals),
      assists: countText(player.assists),
    })),
    games: [...games]
      .sort((a, b) => a.game_no - b.game_no)
      .map((game) => {
        const [teamA, teamB] = getGameTeams(game);
        return {
          rowKey: game.id,
          id: game.id,
          teamA,
          teamB,
          scoreA: game.score_a === null ? "" : String(game.score_a),
          scoreB: game.score_b === null ? "" : String(game.score_b),
          gkA: gameGkKey(game, teamA) ?? "",
          gkB: gameGkKey(game, teamB) ?? "",
        };
      }),
    ownGoals: {
      rev1: countText(getOpponentOwnGoals(session, "rev1")),
      rev2: countText(getOpponentOwnGoals(session, "rev2")),
      rev3: countText(getOpponentOwnGoals(session, "rev3")),
    },
  };
}

function toCheckInput(teams: MatchTeam[], state: SheetState): SheetCheckInput {
  return {
    teams,
    players: state.players.map((player) => ({ key: player.key, team: player.team, goals: parseCount(player.goals) ?? 0 })),
    ownGoals: Object.fromEntries(teams.map((team) => [team, parseCount(state.ownGoals[team]) ?? 0])),
    games: state.games.map((game, index) => ({
      gameNo: index + 1,
      teamA: game.teamA,
      teamB: game.teamB,
      scoreA: parseCount(game.scoreA),
      scoreB: parseCount(game.scoreB),
      gkA: game.gkA || null,
      gkB: game.gkB || null,
    })),
  };
}

function toSaveInput(session: MatchSession, teams: MatchTeam[], state: SheetState): MatchSheetInput {
  return {
    sessionId: session.id,
    revision: session.revision,
    players: state.players.map((player) => ({
      key: player.key,
      team: player.team,
      goals: parseCount(player.goals) ?? 0,
      assists: parseCount(player.assists) ?? 0,
    })),
    ownGoals: Object.fromEntries(teams.map((team) => [team, parseCount(state.ownGoals[team]) ?? 0])),
    games: state.games.map((game) => ({
      id: game.id,
      teamA: game.teamA,
      teamB: game.teamB,
      scoreA: parseCount(game.scoreA),
      scoreB: parseCount(game.scoreB),
      gkA: game.gkA || null,
      gkB: game.gkB || null,
    })),
  };
}

function gkGameCount(state: SheetState, key: string, team?: MatchTeam): number {
  return state.games.filter(
    (game) => (game.gkA === key && (!team || game.teamA === team)) || (game.gkB === key && (!team || game.teamB === team))
  ).length;
}

function recordSummary(state: SheetState, player: SheetPlayer): string | null {
  const parts: string[] = [];
  const goals = parseCount(player.goals) ?? 0;
  const assists = parseCount(player.assists) ?? 0;
  const gkGames = gkGameCount(state, player.key, player.team);
  if (goals > 0) parts.push(`ゴール${goals}`);
  if (assists > 0) parts.push(`アシスト${assists}`);
  if (gkGames > 0) parts.push(`GK${gkGames}試合`);
  return parts.length > 0 ? parts.join("・") : null;
}

/** 選手を外す・別チームへ移すときに、その選手を GK にしていた欄を空にする */
function clearGk(games: SheetGame[], key: string, keepTeam?: MatchTeam): SheetGame[] {
  return games.map((game) => ({
    ...game,
    gkA: game.gkA === key && game.teamA !== keepTeam ? "" : game.gkA,
    gkB: game.gkB === key && game.teamB !== keepTeam ? "" : game.gkB,
  }));
}

function participantLabel(participant: MatchParticipant): string {
  const uniformNo = getParticipantUniformNo(participant);
  return `${uniformNo !== null ? `${uniformNo} ` : ""}${getParticipantDisplayName(participant)}`;
}

export function MatchSheetEditor({
  session,
  teams,
  players,
  games,
  attendees,
  members,
  locked,
  compactMode,
  lastUpdatedLabel,
  onDirtyChange,
  onSaved,
  onReload,
}: {
  session: MatchSession;
  teams: MatchTeam[];
  players: MatchPlayer[];
  games: MatchGame[];
  attendees: MatchParticipant[];
  members: MatchParticipant[];
  locked: boolean;
  compactMode: boolean;
  lastUpdatedLabel: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onReload: () => void;
}) {
  const initial = useMemo(() => initialState(session, players, games), [session, players, games]);
  const [state, setState] = useState<SheetState>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; conflict: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowCounter = useRef(0);

  const dirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(initial), [state, initial]);
  const check = useMemo(() => checkSessionSheet(toCheckInput(teams, state)), [teams, state]);
  const problems = describeSheetProblems(check);
  const attendeeKeys = useMemo(() => new Set(attendees.map(participantKey)), [attendees]);
  const participantsByKey = useMemo(
    () => new Map([...members, ...attendees].map((participant) => [participantKey(participant), participant])),
    [members, attendees]
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(mutator: (current: SheetState) => SheetState) {
    setSaveError((current) => (current?.conflict ? current : null));
    setState(mutator);
  }

  function updateGame(rowKey: string, patch: Partial<SheetGame>) {
    update((current) => ({
      ...current,
      games: current.games.map((game) => (game.rowKey === rowKey ? { ...game, ...patch } : game)),
    }));
  }

  function changeGameTeam(game: SheetGame, side: "A" | "B", team: MatchTeam) {
    const teamOf = (key: string) => state.players.find((player) => player.key === key)?.team;
    const patch: Partial<SheetGame> = side === "A" ? { teamA: team } : { teamB: team };
    // 相手と同じチームを選んだら入れ替える
    if (side === "A" && team === game.teamB) Object.assign(patch, { teamB: game.teamA, gkB: game.gkA, gkA: game.gkB, scoreA: game.scoreB, scoreB: game.scoreA });
    if (side === "B" && team === game.teamA) Object.assign(patch, { teamA: game.teamB, gkA: game.gkB, gkB: game.gkA, scoreA: game.scoreB, scoreB: game.scoreA });
    const next = { ...game, ...patch };
    if (next.gkA && teamOf(next.gkA) !== next.teamA) next.gkA = "";
    if (next.gkB && teamOf(next.gkB) !== next.teamB) next.gkB = "";
    updateGame(game.rowKey, next);
  }

  function addGame() {
    rowCounter.current += 1;
    const [teamA, teamB] =
      teams.length === 3 ? THREE_TEAM_GAME_SEQUENCE[state.games.length % THREE_TEAM_GAME_SEQUENCE.length] : (["rev1", "rev2"] as [MatchTeam, MatchTeam]);
    update((current) => ({
      ...current,
      games: [...current.games, { rowKey: `new-${rowCounter.current}`, id: null, teamA, teamB, scoreA: "", scoreB: "", gkA: "", gkB: "" }],
    }));
  }

  function removeGame(game: SheetGame, index: number) {
    const hasData = game.scoreA !== "" || game.scoreB !== "" || game.gkA !== "" || game.gkB !== "";
    if (hasData && !window.confirm(`第${index + 1}試合の行を削除します。入力したスコア・GKも消えます。よろしいですか？`)) return;
    update((current) => ({ ...current, games: current.games.filter((row) => row.rowKey !== game.rowKey) }));
  }

  function addPlayer(team: MatchTeam, key: string) {
    const participant = participantsByKey.get(key);
    if (!participant) return;
    update((current) => ({
      ...current,
      players: [...current.players, { key, participant, team, goals: "", assists: "" }],
    }));
  }

  function movePlayer(player: SheetPlayer, value: string) {
    const records = recordSummary(state, player);
    const name = getParticipantDisplayName(player.participant);

    if (value === REMOVE_VALUE) {
      if (records && !window.confirm(`${name} には記録（${records}）があります。外すとこれらの記録も消えます。よろしいですか？`)) return;
      update((current) => ({
        ...current,
        players: current.players.filter((row) => row.key !== player.key),
        games: clearGk(current.games, player.key),
      }));
      return;
    }

    const team = value as MatchTeam;
    const gkGames = gkGameCount(state, player.key, player.team);
    if (
      gkGames > 0 &&
      !window.confirm(`${name} は ${TEAM_LABELS[player.team]} のGKとして${gkGames}試合に入っています。${TEAM_LABELS[team]} に移すとGKの欄は空になります。よろしいですか？`)
    ) {
      return;
    }
    update((current) => ({
      ...current,
      players: current.players.map((row) => (row.key === player.key ? { ...row, team } : row)),
      games: clearGk(current.games, player.key, team),
    }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveMatchSheetAction(toSaveInput(session, teams, state));
      if (result.ok) {
        onSaved();
      } else {
        setSaveError({ message: result.message, conflict: result.conflict });
      }
    } catch (error) {
      setSaveError({ message: error instanceof Error ? error.message : "保存に失敗しました。", conflict: false });
    } finally {
      setSaving(false);
    }
  }

  // Enter で次の入力欄へ移る（Tab はブラウザ標準の動き）
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    if (!target.dataset.sheetField) return;
    event.preventDefault();
    const fields = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-sheet-field]:not([disabled])") ?? []);
    const next = fields[fields.indexOf(target) + 1];
    next?.focus();
  }

  const teamPlayers = (team: MatchTeam) =>
    state.players.filter((player) => player.team === team).sort((a, b) => compareParticipants(a.participant, b.participant));
  const inSheet = new Set(state.players.map((player) => player.key));
  const candidates = [...attendees, ...members.filter((member) => !attendeeKeys.has(participantKey(member)))].filter(
    (participant) => !inSheet.has(participantKey(participant))
  );

  return (
    <section className="space-y-3 pb-48" ref={containerRef} onKeyDown={handleKeyDown}>
      <p className="px-1 text-xs text-slate-500">
        用紙の表を上から順に写してください。空欄のゴール・アシストは0として扱います。
        {lastUpdatedLabel ? <span className="block text-slate-400">最終更新: {lastUpdatedLabel}</span> : null}
      </p>

      {/* 1. 試合結果 */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-bold text-ink">試合結果</h2>
          <span className="text-xs text-slate-500">{state.games.length}試合</span>
        </div>

        {teams.length === 2 ? (
          <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_0.75rem_2.75rem_minmax(0,1fr)_1.75rem] items-center gap-1 border-b border-slate-100 px-2 py-1.5 text-[10px] font-bold">
            <span className="text-center text-slate-400">No</span>
            <span className={TEAM_STYLES.rev1.text}>REV1 GK</span>
            <span className={`text-center ${TEAM_STYLES.rev1.text}`}>REV1</span>
            <span />
            <span className={`text-center ${TEAM_STYLES.rev2.text}`}>REV2</span>
            <span className={`text-right ${TEAM_STYLES.rev2.text}`}>REV2 GK</span>
            <span />
          </div>
        ) : null}

        <div className="divide-y divide-slate-100">
          {state.games.length === 0 ? (
            <div className="px-3 py-5 text-center text-sm text-slate-400">「行を追加」で試合を追加してください。</div>
          ) : (
            state.games.map((game, index) => (
              <div className="space-y-1 px-2 py-1.5" key={game.rowKey}>
                {teams.length === 3 ? (
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto_minmax(0,1fr)_1.75rem] items-center gap-1">
                    <span className="text-center text-xs font-bold text-slate-500">{index + 1}</span>
                    <TeamSelect value={game.teamA} teams={teams} disabled={locked} onChange={(team) => changeGameTeam(game, "A", team)} label={`第${index + 1}試合 チームA`} />
                    <span className="text-[10px] font-bold text-slate-400">vs</span>
                    <TeamSelect value={game.teamB} teams={teams} disabled={locked} onChange={(team) => changeGameTeam(game, "B", team)} label={`第${index + 1}試合 チームB`} />
                    <span />
                  </div>
                ) : null}
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_0.75rem_2.75rem_minmax(0,1fr)_1.75rem] items-center gap-1">
                  <span className="text-center text-xs font-bold text-slate-500">{teams.length === 2 ? index + 1 : ""}</span>
                  <GkSelect
                    value={game.gkA}
                    players={teamPlayers(game.teamA)}
                    participantsByKey={participantsByKey}
                    disabled={locked}
                    label={`第${index + 1}試合 ${TEAM_LABELS[game.teamA]} GK`}
                    onChange={(gkA) => updateGame(game.rowKey, { gkA })}
                  />
                  <CountInput
                    value={game.scoreA}
                    team={game.teamA}
                    disabled={locked}
                    missing={game.scoreA === ""}
                    label={`第${index + 1}試合 ${TEAM_LABELS[game.teamA]} 得点`}
                    onChange={(scoreA) => updateGame(game.rowKey, { scoreA })}
                  />
                  <span className="text-center text-slate-300">-</span>
                  <CountInput
                    value={game.scoreB}
                    team={game.teamB}
                    disabled={locked}
                    missing={game.scoreB === ""}
                    label={`第${index + 1}試合 ${TEAM_LABELS[game.teamB]} 得点`}
                    onChange={(scoreB) => updateGame(game.rowKey, { scoreB })}
                  />
                  <GkSelect
                    value={game.gkB}
                    players={teamPlayers(game.teamB)}
                    participantsByKey={participantsByKey}
                    disabled={locked}
                    label={`第${index + 1}試合 ${TEAM_LABELS[game.teamB]} GK`}
                    onChange={(gkB) => updateGame(game.rowKey, { gkB })}
                  />
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                    onClick={() => removeGame(game, index)}
                    disabled={locked}
                    aria-label={`第${index + 1}試合の行を削除`}
                    title="行を削除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
          <button type="button" className="btn-secondary bg-white px-3 py-1.5 text-xs" onClick={addGame} disabled={locked}>
            <Plus className="h-3.5 w-3.5" />
            行を追加
          </button>
          <div className="flex gap-3 text-xs font-bold">
            <span className="text-slate-400">TOTAL</span>
            {teams.map((team) => (
              <span className={TEAM_STYLES[team].text} key={team}>
                {TEAM_LABELS[team]} {check.teamTotals[team].scoreTotal}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 2〜4. チームの表 */}
      {teams.map((team) => {
        const rows = teamPlayers(team);
        const totals = check.teamTotals[team];
        const mismatch = totals.scoreTotal !== totals.goalTotal;
        const assistTotal = rows.reduce((sum, row) => sum + (parseCount(row.assists) ?? 0), 0);

        return (
          <div className="card overflow-hidden" key={team}>
            <div className={`flex items-center justify-between px-3 py-2 ${TEAM_STYLES[team].chip}`}>
              <h2 className="text-sm font-bold">チーム{TEAM_LABELS[team]}</h2>
              <span className="text-xs font-bold">{rows.length}人</span>
            </div>
            <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_2.75rem_4.5rem] items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-[10px] font-bold text-slate-500">
              <span className="text-center">No</span>
              <span>選手名</span>
              <span className="text-center">ゴール</span>
              <span className="text-center">アシスト</span>
              <span className="text-center">チーム</span>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((player) => (
                <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_2.75rem_4.5rem] items-center gap-1 px-2 py-1" key={player.key}>
                  <span className="text-center text-xs text-slate-400">{getParticipantUniformNo(player.participant) ?? "-"}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{getParticipantDisplayName(player.participant)}</div>
                    {player.participant.kind === "member" && !attendeeKeys.has(player.key) ? (
                      <div className="text-[10px] font-semibold text-amber-700">保存すると出席になります</div>
                    ) : null}
                  </div>
                  <CountInput
                    value={player.goals}
                    team={team}
                    disabled={locked}
                    label={`${getParticipantDisplayName(player.participant)} ゴール`}
                    onChange={(goals) => update((current) => ({ ...current, players: current.players.map((row) => (row.key === player.key ? { ...row, goals } : row)) }))}
                  />
                  <CountInput
                    value={player.assists}
                    team={team}
                    disabled={locked}
                    label={`${getParticipantDisplayName(player.participant)} アシスト`}
                    onChange={(assists) => update((current) => ({ ...current, players: current.players.map((row) => (row.key === player.key ? { ...row, assists } : row)) }))}
                  />
                  <select
                    className="form-input h-8 appearance-none !px-1 !py-0 text-center text-xs font-semibold"
                    value={team}
                    disabled={locked}
                    onChange={(event) => movePlayer(player, event.target.value)}
                    aria-label={`${getParticipantDisplayName(player.participant)} のチーム`}
                  >
                    {teams.map((option) => (
                      <option value={option} key={option}>
                        {TEAM_LABELS[option]}
                      </option>
                    ))}
                    <option value={REMOVE_VALUE}>外す</option>
                  </select>
                </div>
              ))}

              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_2.75rem_4.5rem] items-center gap-1 bg-slate-50/60 px-2 py-1">
                <span />
                <span className="text-sm font-semibold text-slate-500">相手OG</span>
                <CountInput
                  value={state.ownGoals[team]}
                  team={team}
                  disabled={locked}
                  label={`${TEAM_LABELS[team]} 相手OG`}
                  onChange={(value) => update((current) => ({ ...current, ownGoals: { ...current.ownGoals, [team]: value } }))}
                />
                <span className="text-center text-xs text-slate-300">-</span>
                <span />
              </div>

              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_2.75rem_4.5rem] items-center gap-1 px-2 py-1.5 text-sm font-bold">
                <span />
                <span className="text-xs text-slate-400">TOTAL</span>
                <span className={`text-center ${mismatch ? "text-rose-600" : "text-ink"}`}>{totals.goalTotal}</span>
                <span className="text-center text-ink">{assistTotal}</span>
                <span />
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${mismatch ? "text-rose-700" : "text-emerald-700"}`}>
                {mismatch ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                スコア合計 {totals.scoreTotal} / ゴール合計 {totals.goalTotal}
              </div>
              {!locked ? (
                <select
                  className="form-input h-9 bg-white text-xs"
                  value=""
                  onChange={(event) => event.target.value && addPlayer(team, event.target.value)}
                  aria-label={`${TEAM_LABELS[team]} に選手を追加`}
                >
                  <option value="">＋ 選手を追加（用紙にだけ書いた人など）</option>
                  <optgroup label="出席者・ゲスト">
                    {candidates
                      .filter((participant) => attendeeKeys.has(participantKey(participant)))
                      .map((participant) => (
                        <option value={participantKey(participant)} key={participantKey(participant)}>
                          {participantLabel(participant)}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="出席になっていないメンバー">
                    {candidates
                      .filter((participant) => !attendeeKeys.has(participantKey(participant)))
                      .map((participant) => (
                        <option value={participantKey(participant)} key={participantKey(participant)}>
                          {participantLabel(participant)}
                        </option>
                      ))}
                  </optgroup>
                </select>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* チェック結果と一時保存（入力中も常に見えるよう、下部ナビのすぐ上に固定） */}
      <div className="fixed inset-x-0 bottom-[3.6rem] z-10 px-3">
        <div className={`mx-auto ${compactMode ? "max-w-md" : "max-w-6xl"} rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur`}>
          {saveError ? (
            <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {saveError.message}
              {saveError.conflict ? (
                <button type="button" className="mt-2 flex items-center gap-1 font-bold text-rose-800 underline" onClick={onReload}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  再読み込みする（入力中の内容は消えます）
                </button>
              ) : null}
            </div>
          ) : null}
          {problems.length > 0 ? (
            <ul className="mb-2 max-h-24 space-y-0.5 overflow-y-auto text-xs text-rose-700">
              {problems.map((problem) => (
                <li className="flex gap-1" key={problem}>
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{problem}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              確定できる状態です（確定は管理者がスタッツタブで行います）
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className={`flex-1 text-xs ${dirty ? "font-semibold text-amber-700" : "text-slate-400"}`}>
              {locked ? "確定済みのため編集できません" : dirty ? "未保存の変更があります" : "保存済み"}
            </span>
            <button type="button" className="btn-primary px-4" onClick={save} disabled={locked || saving || !dirty}>
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : "一時保存"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CountInput({
  value,
  team,
  disabled,
  missing = false,
  label,
  onChange,
}: {
  value: string;
  team: MatchTeam;
  disabled: boolean;
  missing?: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="next"
      autoComplete="off"
      data-sheet-field
      className={`h-8 w-full rounded-md border px-1 text-center text-base font-bold tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-slate-50 ${
        missing ? "border-amber-300 bg-amber-50/50" : `border-slate-200 ${TEAM_STYLES[team].soft}`
      }`}
      value={value}
      disabled={disabled}
      aria-label={label}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(digitsOnly(event.target.value))}
    />
  );
}

function GkSelect({
  value,
  players,
  participantsByKey,
  disabled,
  label,
  onChange,
}: {
  value: string;
  players: SheetPlayer[];
  participantsByKey: Map<string, MatchParticipant>;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  const known = players.some((player) => player.key === value);
  const outsider = value && !known ? participantsByKey.get(value) : null;

  return (
    <select
      data-sheet-field
      className={`form-input h-8 min-w-0 appearance-none truncate !px-1 !py-0 text-xs ${!value || !known ? "border-amber-300 bg-amber-50/50" : ""}`}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">GK選択</option>
      {value && !known ? (
        <option value={value}>⚠ 編成外: {outsider ? getParticipantDisplayName(outsider) : "不明な選手"}</option>
      ) : null}
      {players.map((player) => (
        <option value={player.key} key={player.key}>
          {participantLabel(player.participant)}
        </option>
      ))}
    </select>
  );
}

function TeamSelect({
  value,
  teams,
  disabled,
  label,
  onChange,
}: {
  value: MatchTeam;
  teams: MatchTeam[];
  disabled: boolean;
  label: string;
  onChange: (team: MatchTeam) => void;
}) {
  return (
    <select
      data-sheet-field
      className={`form-input h-8 appearance-none !px-1 !py-0 text-center text-xs font-bold ${TEAM_STYLES[value].chip}`}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as MatchTeam)}
    >
      {teams.map((team) => (
        <option value={team} key={team}>
          {TEAM_LABELS[team]}
        </option>
      ))}
    </select>
  );
}
