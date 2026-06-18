"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Ban, BarChart3, Check, CheckCircle2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import {
  addGoalRecordAction,
  addMatchGameAction,
  assignSessionPlayerAction,
  cancelGoalRecordAction,
  confirmMatchSessionAction,
  createMatchSessionAction,
  deleteMatchGameAction,
  deleteMatchSessionAction,
  reopenMatchSessionAction,
  updateMatchSessionTeamCountAction,
  updateGoalRecordAction,
  updateMatchGameGkAction,
} from "@/lib/actions/matches";
import {
  computeSessionStats,
  compareParticipants,
  formatRatio,
  gameGkKey,
  getGameLabel,
  getGameScore,
  getGameTeams,
  getParticipantDisplayName,
  getParticipantUniformNo,
  getSessionTeams,
  goalAssistKey,
  goalScorerKey,
  TEAM_LABELS,
  type MatchPlayer,
  type MatchParticipant,
  matchPlayerKey,
  participantKey,
} from "@/lib/matchStats";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Event, MatchGame, MatchGoalRecord, MatchSession, MatchTeam, Profile } from "@/lib/types";

type TabId = "teams" | "live" | "stats";

type GoalModal =
  | { mode: "add"; team: MatchTeam }
  | { mode: "edit"; goal: MatchGoalRecord; team: MatchTeam }
  | null;

type DeleteModal =
  | { kind: "session"; session: MatchSession }
  | { kind: "game"; game: MatchGame }
  | null;

type MatchSessionClientProps = {
  event: Event;
  profile: Profile;
  attendees: MatchParticipant[];
  sessions: MatchSession[];
  selectedSession: MatchSession | null;
  players: MatchPlayer[];
  games: MatchGame[];
  goals: MatchGoalRecord[];
  initialTab: TabId;
  error?: string;
};

const TEAM_STYLES: Record<MatchTeam, { chip: string; text: string; soft: string; button: string; border: string; submit: string }> = {
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

function eventDateLabel(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function teamPlayers(players: MatchPlayer[], team: MatchTeam): MatchPlayer[] {
  return players.filter((player) => player.team === team).sort((a, b) => compareParticipants(a.participant, b.participant));
}

export function MatchSessionClient({
  event,
  profile,
  attendees,
  sessions,
  selectedSession,
  players,
  games,
  goals,
  initialTab,
  error,
}: MatchSessionClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [selectedGameId, setSelectedGameId] = useState(games[games.length - 1]?.id ?? "");
  const [goalModal, setGoalModal] = useState<GoalModal>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModal>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refreshSoon = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 150);
    };

    async function setup() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        supabase.realtime.setAuth(data.session.access_token);
      }

      const channelName = `match-results-${event.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "event_guests" }, refreshSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_sessions" }, refreshSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_session_players" }, refreshSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_games" }, refreshSoon)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_goal_records" }, refreshSoon)
        .subscribe();
    }

    setup();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [event.id, router]);

  const playerByKey = useMemo(() => new Map(players.map((player) => [matchPlayerKey(player), player.participant])), [players]);
  const assignmentByKey = useMemo(() => new Map(players.map((player) => [matchPlayerKey(player), player.team])), [players]);
  const effectiveSelectedGameId = games.some((game) => game.id === selectedGameId)
    ? selectedGameId
    : games[games.length - 1]?.id ?? "";
  const selectedGame = games.find((game) => game.id === effectiveSelectedGameId) ?? games[0] ?? null;
  const selectedGameGoals = selectedGame
    ? goals
        .filter((goal) => goal.game_id === selectedGame.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];
  const stats = useMemo(() => computeSessionStats(players, games, goals), [players, games, goals]);
  const activeTeams = selectedSession ? getSessionTeams(selectedSession) : (["rev1", "rev2"] satisfies MatchTeam[]);
  const playersByTeam = useMemo(
    () => Object.fromEntries(activeTeams.map((team) => [team, teamPlayers(players, team)])) as Record<MatchTeam, MatchPlayer[]>,
    [activeTeams, players]
  );
  const unassigned = attendees
    .filter((participant) => !assignmentByKey.has(participantKey(participant)))
    .sort(compareParticipants);
  const canUseInputTabs = unassigned.length === 0 && activeTeams.every((team) => (playersByTeam[team] ?? []).length > 0);
  const visibleTab = canUseInputTabs ? activeTab : "teams";
  const locked = selectedSession?.status === "confirmed" && profile.role !== "admin";

  function switchSession(sessionId: string) {
    const params = new URLSearchParams();
    params.set("session", sessionId);
    params.set("tab", visibleTab);
    router.push(`/events/${event.id}/matches?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{eventDateLabel(event.event_date)}</p>
          <h1 className="truncate text-xl font-bold text-ink">試合結果</h1>
          <p className="mt-1 truncate text-sm text-slate-500">{event.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          同期中
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-lg border border-primary/25 bg-primary-light/30 p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-normal text-primary">Session</p>
            <h2 className="text-lg font-bold text-ink">
              {selectedSession ? `セッション${selectedSession.session_no}` : "セッション未作成"}
            </h2>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
              selectedSession?.status === "confirmed"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-white text-primary"
            }`}
          >
            {selectedSession?.status === "confirmed" ? "確定済み" : selectedSession ? "試合中" : "未作成"}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <select
            className="form-input bg-white"
            value={selectedSession?.id ?? ""}
            onChange={(event) => switchSession(event.target.value)}
            disabled={sessions.length === 0}
          >
            {sessions.length === 0 ? <option value="">セッションなし</option> : null}
            {sessions.map((session) => (
              <option value={session.id} key={session.id}>
                セッション{session.session_no}・{session.status === "confirmed" ? "確定済み" : "試合中"}
              </option>
            ))}
          </select>
          <form action={createMatchSessionAction}>
            <input type="hidden" name="event_id" value={event.id} />
            <button type="submit" className="btn-secondary h-full w-full whitespace-nowrap bg-white">
              <Plus className="h-4 w-4" />
              セッション追加
            </button>
          </form>
          <button
            type="button"
            className="btn-danger h-full w-full whitespace-nowrap"
            disabled={!selectedSession || locked}
            onClick={() => selectedSession && setDeleteModal({ kind: "session", session: selectedSession })}
          >
            <Trash2 className="h-4 w-4" />
            削除
          </button>
        </div>
      </div>

      {!selectedSession ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500">まだセッションがありません。</p>
          <form action={createMatchSessionAction} className="mt-4">
            <input type="hidden" name="event_id" value={event.id} />
            <button type="submit" className="btn-primary">
              <Plus className="h-4 w-4" />
              セッション追加
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-white p-1">
            <TabButton active={visibleTab === "teams"} onClick={() => setActiveTab("teams")} icon={<Users className="h-4 w-4" />} label="編成" />
            <TabButton
              active={visibleTab === "live"}
              onClick={() => setActiveTab("live")}
              icon={<Activity className="h-4 w-4" />}
              label="ライブ"
              disabled={!canUseInputTabs}
            />
            <TabButton
              active={visibleTab === "stats"}
              onClick={() => setActiveTab("stats")}
              icon={<BarChart3 className="h-4 w-4" />}
              label="スタッツ"
              disabled={!canUseInputTabs}
            />
          </div>

          {selectedSession.status === "confirmed" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              このセッションは確定済みです。管理者のみ編集できます。
            </div>
          ) : null}

          {visibleTab === "teams" ? (
            <TeamsTab
              attendees={attendees}
              session={selectedSession}
              activeTeams={activeTeams}
              playersByTeam={playersByTeam}
              unassigned={unassigned}
              gameCount={games.length}
              locked={locked}
            />
          ) : null}

          {visibleTab === "live" ? (
            <LiveTab
              session={selectedSession}
              games={games}
              goals={goals}
              selectedGame={selectedGame}
              selectedGameGoals={selectedGameGoals}
              activeTeams={activeTeams}
              playersByTeam={playersByTeam}
              playerByKey={playerByKey}
              locked={locked}
              selectedGameId={effectiveSelectedGameId}
              onGameChange={setSelectedGameId}
              onGoalModal={setGoalModal}
              onDeleteGame={(game) => setDeleteModal({ kind: "game", game })}
            />
          ) : null}

          {visibleTab === "stats" ? (
            <StatsTab
              session={selectedSession}
              games={games}
              goals={goals}
              stats={stats}
              profile={profile}
              locked={locked}
              activeTeams={activeTeams}
            />
          ) : null}

          {goalModal && selectedGame ? (
            <GoalDialog
              modal={goalModal}
              game={selectedGame}
              players={playersByTeam[goalModal.team] ?? []}
              playerByKey={playerByKey}
              onClose={() => setGoalModal(null)}
              onSaved={() => {
                setGoalModal(null);
                const params = new URLSearchParams();
                params.set("session", selectedSession.id);
                params.set("tab", "live");
                router.replace(`/events/${event.id}/matches?${params.toString()}`);
                router.refresh();
              }}
              locked={locked}
            />
          ) : null}

          {deleteModal ? (
            <DeleteConfirmDialog modal={deleteModal} onClose={() => setDeleteModal(null)} />
          ) : null}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition ${
        active
          ? "bg-primary text-white"
          : disabled
            ? "cursor-not-allowed text-slate-300"
            : "text-slate-500 hover:bg-slate-50 hover:text-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TeamsTab({
  attendees,
  session,
  activeTeams,
  playersByTeam,
  unassigned,
  gameCount,
  locked,
}: {
  attendees: MatchParticipant[];
  session: MatchSession;
  activeTeams: MatchTeam[];
  playersByTeam: Record<MatchTeam, MatchPlayer[]>;
  unassigned: MatchParticipant[];
  gameCount: number;
  locked: boolean;
}) {
  const teamCountLocked = locked || gameCount > 0;

  return (
    <section className="space-y-3">
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">チーム数</h2>
            <p className="text-xs text-slate-500">今日の編成を選択します。</p>
          </div>
          {gameCount > 0 ? <span className="text-xs text-slate-400">試合追加後は変更不可</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[2, 3].map((teamCount) => (
            <form action={updateMatchSessionTeamCountAction} key={teamCount}>
              <input type="hidden" name="session_id" value={session.id} />
              <input type="hidden" name="team_count" value={teamCount} />
              <button
                type="submit"
                disabled={teamCountLocked || session.team_count === teamCount}
                className={`h-10 w-full rounded-md border text-sm font-bold transition disabled:cursor-not-allowed ${
                  session.team_count === teamCount
                    ? "border-primary bg-primary text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-primary/40 hover:bg-primary-light/30"
                }`}
              >
                {teamCount}チーム
              </button>
            </form>
          ))}
        </div>
      </div>

      <p className="px-1 text-xs text-slate-500">出席者を{activeTeams.map((team) => TEAM_LABELS[team]).join("/")}に振り分けます。タップで戻せます。</p>

      <div className={`grid gap-3 ${activeTeams.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {activeTeams.map((team) => (
          <TeamColumn key={team} team={team} players={playersByTeam[team] ?? []} sessionId={session.id} locked={locked} />
        ))}
      </div>

      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">未振り分け</h2>
          <span className="text-xs text-slate-400">{unassigned.length} / {attendees.length}人</span>
        </div>
        <div className="space-y-2">
          {unassigned.length === 0 ? (
            <div className="rounded-md bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">全員振り分け済み</div>
          ) : (
            unassigned.map((participant) => (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2" key={participantKey(participant)}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="w-8 text-xs text-slate-400">{getParticipantUniformNo(participant) ?? "-"}</span>
                  <span>{getParticipantDisplayName(participant)}</span>
                </div>
                <div className={`grid gap-2 ${activeTeams.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {activeTeams.map((team) => (
                    <AssignButton key={team} sessionId={session.id} participant={participant} team={team} disabled={locked} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </section>
  );
}

function TeamColumn({
  team,
  players,
  sessionId,
  locked,
}: {
  team: MatchTeam;
  players: MatchPlayer[];
  sessionId: string;
  locked: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <div className={`px-3 py-2 text-center text-sm font-bold ${TEAM_STYLES[team].chip}`}>{TEAM_LABELS[team]} {players.length}人</div>
      <div className="space-y-2 p-2">
        {players.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-slate-400">未設定</div>
        ) : (
          players.map((player) => (
            <form action={assignSessionPlayerAction} key={matchPlayerKey(player)}>
              <input type="hidden" name="session_id" value={sessionId} />
              <input type="hidden" name="participant_kind" value={player.participant.kind} />
              <input type="hidden" name="participant_id" value={player.participant.id} />
              <input type="hidden" name="team" value="" />
              <button
                type="submit"
                disabled={locked}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm font-semibold ${TEAM_STYLES[team].button} disabled:opacity-70`}
              >
                <span className="w-7 text-xs opacity-70">{getParticipantUniformNo(player.participant) ?? "-"}</span>
                <span className="min-w-0 truncate">{getParticipantDisplayName(player.participant)}</span>
              </button>
            </form>
          ))
        )}
      </div>
    </div>
  );
}

function AssignButton({
  sessionId,
  participant,
  team,
  disabled,
}: {
  sessionId: string;
  participant: MatchParticipant;
  team: MatchTeam;
  disabled: boolean;
}) {
  return (
    <form action={assignSessionPlayerAction}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="participant_kind" value={participant.kind} />
      <input type="hidden" name="participant_id" value={participant.id} />
      <input type="hidden" name="team" value={team} />
      <button type="submit" className={`w-full rounded-md border px-2 py-1.5 text-xs font-bold ${TEAM_STYLES[team].button}`} disabled={disabled}>
        {TEAM_LABELS[team]}
      </button>
    </form>
  );
}

function LiveTab({
  session,
  games,
  goals,
  selectedGame,
  selectedGameGoals,
  activeTeams,
  playersByTeam,
  playerByKey,
  locked,
  selectedGameId,
  onGameChange,
  onGoalModal,
  onDeleteGame,
}: {
  session: MatchSession;
  games: MatchGame[];
  goals: MatchGoalRecord[];
  selectedGame: MatchGame | null;
  selectedGameGoals: MatchGoalRecord[];
  activeTeams: MatchTeam[];
  playersByTeam: Record<MatchTeam, MatchPlayer[]>;
  playerByKey: Map<string, MatchParticipant>;
  locked: boolean;
  selectedGameId: string;
  onGameChange: (gameId: string) => void;
  onGoalModal: (modal: GoalModal) => void;
  onDeleteGame: (game: MatchGame) => void;
}) {
  const score = selectedGame ? getGameScore(selectedGame, goals) : null;
  const selectedGameTeams = selectedGame ? getGameTeams(selectedGame) : ([activeTeams[0], activeTeams[1]] as [MatchTeam, MatchTeam]);
  const goalInputDisabled = !selectedGame || selectedGameTeams.some((team) => !gameGkKey(selectedGame, team)) || locked;

  return (
    <section className="space-y-3">
      <div className="card p-3">
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <select className="form-input" value={selectedGameId} onChange={(event) => onGameChange(event.target.value)} disabled={games.length === 0}>
            {games.length === 0 ? <option value="">試合なし</option> : null}
            {games.map((game) => (
              <option value={game.id} key={game.id}>
                {getGameLabel(game, goals)}
              </option>
            ))}
          </select>
          <form action={addMatchGameAction} className={activeTeams.length === 3 ? "grid grid-cols-2 gap-1 sm:min-w-[11rem]" : ""}>
            <input type="hidden" name="session_id" value={session.id} />
            {activeTeams.length === 3 ? (
              <>
                <select name="team_a" className="form-input h-full px-2 py-1 text-xs" defaultValue="rev1" disabled={locked}>
                  {activeTeams.map((team) => (
                    <option value={team} key={team}>
                      {TEAM_LABELS[team]}
                    </option>
                  ))}
                </select>
                <select name="team_b" className="form-input h-full px-2 py-1 text-xs" defaultValue="rev2" disabled={locked}>
                  {activeTeams.map((team) => (
                    <option value={team} key={team}>
                      {TEAM_LABELS[team]}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <button type="submit" className={`${activeTeams.length === 3 ? "col-span-2" : ""} btn-secondary h-full w-full whitespace-nowrap`} disabled={locked}>
              <Plus className="h-4 w-4" />
              試合追加
            </button>
          </form>
          <button
            type="button"
            className="btn-danger h-full w-full whitespace-nowrap"
            disabled={!selectedGame || locked}
            onClick={() => selectedGame && onDeleteGame(selectedGame)}
          >
            <Trash2 className="h-4 w-4" />
            削除
          </button>
        </div>

        {selectedGame && score ? (
          <div className="space-y-3" key={selectedGame.id}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <ScoreBlock team={selectedGameTeams[0]} value={score[selectedGameTeams[0]]} />
              <span className="pb-4 text-sm font-semibold text-slate-300">対</span>
              <ScoreBlock team={selectedGameTeams[1]} value={score[selectedGameTeams[1]]} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {selectedGameTeams.map((team) => (
                <GkSelect
                  key={`${selectedGame.id}-${team}-${gameGkKey(selectedGame, team) ?? "none"}`}
                  gameId={selectedGame.id}
                  team={team}
                  players={playersByTeam[team] ?? []}
                  defaultValue={gameGkKey(selectedGame, team) ?? ""}
                  locked={locked}
                />
              ))}
            </div>
            <p className="text-center text-xs text-slate-400">
              GKは選択すると保存され、GK回数とGK時失点の集計に反映されます。
            </p>
          </div>
        ) : (
          <div className="rounded-md bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">試合を追加してください。</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {selectedGameTeams.map((team) => (
          <GoalButton
            key={team}
            team={team}
            disabled={goalInputDisabled || (playersByTeam[team] ?? []).length === 0}
            onClick={() => onGoalModal({ mode: "add", team })}
          />
        ))}
      </div>
      {selectedGame && !locked && goalInputDisabled ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ゴール入力は両チームのGKを設定してから行えます。
        </div>
      ) : null}

      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">{selectedGame ? `第${selectedGame.game_no}試合の記録` : "記録"}</h2>
          <span className="text-xs text-slate-400">{selectedGameGoals.filter((goal) => !goal.cancelled_at).length}件</span>
        </div>
        <div className="space-y-2">
          {selectedGameGoals.length === 0 ? (
            <div className="rounded-md bg-slate-50 px-3 py-8 text-center text-sm text-slate-400">まだ記録がありません</div>
          ) : (
            selectedGameGoals.map((goal) => (
              <GoalFeedItem
                goal={goal}
                scorer={playerByKey.get(goalScorerKey(goal))}
                assist={goalAssistKey(goal) ? playerByKey.get(goalAssistKey(goal) ?? "") : null}
                locked={locked}
                onEdit={() => onGoalModal({ mode: "edit", goal, team: goal.team })}
                key={goal.id}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ScoreBlock({ team, value }: { team: MatchTeam; value: number }) {
  return (
    <div className="text-center">
      <div className={`text-xs font-bold ${TEAM_STYLES[team].text}`}>{TEAM_LABELS[team]}</div>
      <div className="border-b border-slate-300 py-1 text-4xl font-bold text-ink">{value}</div>
    </div>
  );
}

function GkSelect({
  gameId,
  team,
  players,
  defaultValue,
  locked,
}: {
  gameId: string;
  team: MatchTeam;
  players: MatchPlayer[];
  defaultValue: string;
  locked: boolean;
}) {
  return (
    <form action={updateMatchGameGkAction}>
      <input type="hidden" name="game_id" value={gameId} />
      <input type="hidden" name="team" value={team} />
      <span className={`mb-1 block text-xs font-bold ${TEAM_STYLES[team].text}`}>{TEAM_LABELS[team]} GK</span>
      <select
        name="gk_key"
        defaultValue={defaultValue}
        className="form-input"
        disabled={locked}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">未設定</option>
        {players.map((player) => (
          <option value={matchPlayerKey(player)} key={matchPlayerKey(player)}>
            {getParticipantUniformNo(player.participant) ? `${getParticipantUniformNo(player.participant)} ` : ""}
            {getParticipantDisplayName(player.participant)}
          </option>
        ))}
      </select>
    </form>
  );
}

function GoalButton({
  team,
  disabled,
  onClick,
}: {
  team: MatchTeam;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3 py-4 text-center font-bold transition disabled:opacity-50 ${TEAM_STYLES[team].button}`}
    >
      <span className="block text-xs">{TEAM_LABELS[team]} ゴール</span>
      <span className="mt-1 inline-flex items-center gap-1 text-sm">
        <Plus className="h-4 w-4" />
        記録する
      </span>
    </button>
  );
}

function GoalFeedItem({
  goal,
  scorer,
  assist,
  locked,
  onEdit,
}: {
  goal: MatchGoalRecord;
  scorer?: MatchParticipant;
  assist: MatchParticipant | null | undefined;
  locked: boolean;
  onEdit: () => void;
}) {
  const cancelled = Boolean(goal.cancelled_at);
  return (
    <div className={`rounded-md border-l-4 p-3 ${TEAM_STYLES[goal.team].soft} ${TEAM_STYLES[goal.team].border} ${cancelled ? "opacity-55" : ""}`}>
      <div className="flex items-start gap-2">
        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${TEAM_STYLES[goal.team].text}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">
            {scorer ? getParticipantDisplayName(scorer) : "不明な選手"}
            <span className="ml-2 text-xs font-medium text-slate-500">ゴール</span>
          </div>
          <div className="text-sm text-slate-700">
            <span className="text-xs text-slate-500">アシスト </span>
            <span className="font-semibold">{assist ? getParticipantDisplayName(assist) : "なし"}</span>
          </div>
          {cancelled ? <div className="mt-1 text-xs font-semibold text-rose-600">取消済み</div> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[10px] text-slate-400">
            {new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(goal.created_at))}
          </span>
          {!locked && !cancelled ? (
            <div className="flex gap-1">
              <button type="button" onClick={onEdit} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                <Pencil className="inline h-3 w-3" />
              </button>
              <form
                action={cancelGoalRecordAction}
                onSubmit={(event) => {
                  if (!confirm("このゴール記録を取り消しますか？")) event.preventDefault();
                }}
              >
                <input type="hidden" name="goal_id" value={goal.id} />
                <button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                  <Ban className="inline h-3 w-3" />
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GoalDialog({
  modal,
  game,
  players,
  playerByKey,
  onClose,
  onSaved,
  locked,
}: {
  modal: Exclude<GoalModal, null>;
  game: MatchGame;
  players: MatchPlayer[];
  playerByKey: Map<string, MatchParticipant>;
  onClose: () => void;
  onSaved: () => void;
  locked: boolean;
}) {
  const isEdit = modal.mode === "edit";
  const team = modal.team;
  const defaultScorer = isEdit ? goalScorerKey(modal.goal) : players[0] ? matchPlayerKey(players[0]) : "";
  const defaultAssist = isEdit ? goalAssistKey(modal.goal) ?? "" : "";
  const action = isEdit ? updateGoalRecordAction : addGoalRecordAction;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className={`flex items-center justify-between border-b border-slate-200 px-4 py-3 ${TEAM_STYLES[team].soft}`}>
          <h2 className={`text-sm font-bold ${TEAM_STYLES[team].text}`}>
            {TEAM_LABELS[team]} ゴールを{isEdit ? "修正" : "記録"}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/70 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          action={async (formData) => {
            await action(formData);
            onSaved();
          }}
          className="space-y-3 p-4"
        >
          {isEdit ? <input type="hidden" name="goal_id" value={modal.goal.id} /> : null}
          {!isEdit ? (
            <>
              <input type="hidden" name="game_id" value={game.id} />
              <input type="hidden" name="team" value={team} />
            </>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">ゴール</span>
            <select name="scorer_key" defaultValue={defaultScorer} className="form-input" required disabled={locked}>
              {players.map((player) => (
                <option value={matchPlayerKey(player)} key={matchPlayerKey(player)}>
                  {getParticipantUniformNo(player.participant) ? `${getParticipantUniformNo(player.participant)} ` : ""}
                  {getParticipantDisplayName(player.participant)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">アシスト</span>
            <select name="assist_key" defaultValue={defaultAssist} className="form-input" disabled={locked}>
              <option value="">なし</option>
              {players.map((player) => (
                <option value={matchPlayerKey(player)} key={matchPlayerKey(player)}>
                  {getParticipantUniformNo(player.participant) ? `${getParticipantUniformNo(player.participant)} ` : ""}
                  {getParticipantDisplayName(player.participant)}
                </option>
              ))}
            </select>
          </label>
          {isEdit ? (
            <p className="text-xs text-slate-500">
              現在: {playerByKey.get(goalScorerKey(modal.goal)) ? getParticipantDisplayName(playerByKey.get(goalScorerKey(modal.goal))!) : "不明な選手"}
            </p>
          ) : null}
          <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">
              キャンセル
            </button>
            <button type="submit" className={`btn-primary ${TEAM_STYLES[team].submit}`} disabled={locked || players.length === 0}>
              <Check className="h-4 w-4" />
              確定する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  modal,
  onClose,
}: {
  modal: Exclude<DeleteModal, null>;
  onClose: () => void;
}) {
  const isSession = modal.kind === "session";
  const action = isSession ? deleteMatchSessionAction : deleteMatchGameAction;
  const title = isSession ? `セッション${modal.session.session_no}を削除` : `第${modal.game.game_no}試合を削除`;
  const description = isSession
    ? "このセッションの編成、試合、ゴール、アシスト、GK記録がすべて削除されます。"
    : "この試合のゴール、アシスト、GK記録が削除されます。";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-lg border border-rose-200 bg-white shadow-xl">
        <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-rose-900">{title}</h2>
            <p className="mt-1 text-xs text-rose-700">本当に削除してよいですか？</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-rose-400 hover:bg-white/70 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-600">{description}</p>
          <form action={action} className="grid grid-cols-[1fr_2fr] gap-2">
            {isSession ? (
              <input type="hidden" name="session_id" value={modal.session.id} />
            ) : (
              <input type="hidden" name="game_id" value={modal.game.id} />
            )}
            <button type="button" onClick={onClose} className="btn-secondary">
              キャンセル
            </button>
            <button type="submit" className="btn-danger">
              <Trash2 className="h-4 w-4" />
              削除する
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatsTab({
  session,
  games,
  goals,
  stats,
  profile,
  locked,
  activeTeams,
}: {
  session: MatchSession;
  games: MatchGame[];
  goals: MatchGoalRecord[];
  stats: ReturnType<typeof computeSessionStats>;
  profile: Profile;
  locked: boolean;
  activeTeams: MatchTeam[];
}) {
  const totals = Object.fromEntries(
    activeTeams.map((team) => [team, games.reduce((sum, game) => sum + getGameScore(game, goals)[team], 0)])
  ) as Record<MatchTeam, number>;

  return (
    <section className="space-y-3">
      <div className="card p-3">
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-500">試合数</span>
          <span className="font-bold text-ink">{games.length}試合</span>
        </div>
        {activeTeams.map((team) => (
          <div className="flex justify-between py-1 text-sm" key={team}>
            <span className="text-slate-500">{TEAM_LABELS[team]} 合計</span>
            <span className={`font-bold ${TEAM_STYLES[team].text}`}>{totals[team]}点</span>
          </div>
        ))}
      </div>

      {activeTeams.map((team) => (
        <StatsTeamSection key={team} team={team} stats={stats.filter((row) => row.team === team)} />
      ))}

      {profile.role === "admin" ? (
        session.status === "confirmed" ? (
          <form action={reopenMatchSessionAction}>
            <input type="hidden" name="session_id" value={session.id} />
            <button type="submit" className="btn-secondary w-full">
              試合中に戻す
            </button>
          </form>
        ) : (
          <form action={confirmMatchSessionAction}>
            <input type="hidden" name="session_id" value={session.id} />
            <button type="submit" className="btn-primary w-full">
              <CheckCircle2 className="h-4 w-4" />
              セッションを確定する
            </button>
          </form>
        )
      ) : (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
          確定操作は管理ユーザーのみ可能です。
        </div>
      )}

      {locked ? null : null}
    </section>
  );
}

function StatsTeamSection({
  team,
  stats,
}: {
  team: MatchTeam;
  stats: ReturnType<typeof computeSessionStats>;
}) {
  return (
    <div className="space-y-2">
      <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${TEAM_STYLES[team].chip}`}>{TEAM_LABELS[team]}</div>
      {stats.length === 0 ? (
        <div className="card p-4 text-sm text-slate-400">選手がいません。</div>
      ) : (
        stats.map((row) => (
          <article className="card p-3" key={participantKey(row.participant)}>
            <div className="mb-2 flex items-center gap-2">
              <span className="w-8 text-xs text-slate-400">{getParticipantUniformNo(row.participant) ?? "-"}</span>
              <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{getParticipantDisplayName(row.participant)}</h3>
              <span className="text-xs font-semibold text-slate-500">{row.points}pt</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <StatCell label="G" value={row.goals} />
              <StatCell label="A" value={row.assists} />
              <StatCell label="失点" value={row.gkGames > 0 ? row.gkGoalsAgainst : "-"} />
              <StatCell label="GK" value={row.gkGames > 0 ? row.gkGames : "-"} />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              <StatCell label="勝" value={row.wins} />
              <StatCell label="分" value={row.draws} />
              <StatCell label="負" value={row.losses} />
              <StatCell label="平均Pt" value={formatRatio(row.points, row.games)} />
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 px-1.5 py-2">
      <div className="text-[10px] font-semibold text-slate-400">{label}</div>
      <div className="text-sm font-bold text-slate-700">{value}</div>
    </div>
  );
}
