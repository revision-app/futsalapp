"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Ban, BarChart3, Check, CheckCircle2, Pencil, Plus, Users, X } from "lucide-react";
import {
  addGoalRecordAction,
  addMatchGameAction,
  assignSessionPlayerAction,
  cancelGoalRecordAction,
  confirmMatchSessionAction,
  createMatchSessionAction,
  reopenMatchSessionAction,
  updateGoalRecordAction,
  updateMatchGameGkAction,
} from "@/lib/actions/matches";
import {
  computeSessionStats,
  formatRatio,
  getGameLabel,
  getGameScore,
  type MatchPlayer,
} from "@/lib/matchStats";
import { getProfileDisplayName } from "@/lib/profile";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { Event, MatchGame, MatchGoalRecord, MatchSession, MatchTeam, Profile } from "@/lib/types";

type TabId = "teams" | "live" | "stats";

type GoalModal =
  | { mode: "add"; team: MatchTeam }
  | { mode: "edit"; goal: MatchGoalRecord; team: MatchTeam }
  | null;

type MatchSessionClientProps = {
  event: Event;
  profile: Profile;
  attendees: Profile[];
  sessions: MatchSession[];
  selectedSession: MatchSession | null;
  players: MatchPlayer[];
  games: MatchGame[];
  goals: MatchGoalRecord[];
  initialTab: TabId;
  error?: string;
};

const TEAM_LABELS: Record<MatchTeam, string> = {
  rev1: "REV1",
  rev2: "REV2",
};

const TEAM_STYLES: Record<MatchTeam, { chip: string; text: string; soft: string; button: string }> = {
  rev1: {
    chip: "border-amber-300 bg-amber-50 text-amber-950",
    text: "text-amber-800",
    soft: "bg-amber-50",
    button: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
  },
  rev2: {
    chip: "border-rose-300 bg-rose-50 text-rose-950",
    text: "text-rose-800",
    soft: "bg-rose-50",
    button: "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100",
  },
};

function eventDateLabel(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function profileSort(a: Profile, b: Profile): number {
  return (a.uniform_no ?? 9999) - (b.uniform_no ?? 9999) || getProfileDisplayName(a).localeCompare(getProfileDisplayName(b));
}

function teamPlayers(players: MatchPlayer[], team: MatchTeam): MatchPlayer[] {
  return players.filter((player) => player.team === team).sort((a, b) => profileSort(a.profile, b.profile));
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

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 150);
    };

    const channel = supabase
      .channel(`match-results-${event.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_sessions" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_session_players" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_games" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_goal_records" }, refreshSoon)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [event.id, router]);

  const playerById = useMemo(() => new Map(players.map((player) => [player.user_id, player.profile])), [players]);
  const assignmentByUserId = useMemo(() => new Map(players.map((player) => [player.user_id, player.team])), [players]);
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
  const rev1Players = teamPlayers(players, "rev1");
  const rev2Players = teamPlayers(players, "rev2");
  const unassigned = attendees
    .filter((user) => !assignmentByUserId.has(user.id))
    .sort(profileSort);
  const locked = selectedSession?.status === "confirmed" && profile.role !== "admin";

  function switchSession(sessionId: string) {
    const params = new URLSearchParams();
    params.set("session", sessionId);
    params.set("tab", activeTab);
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

      <div className="card p-3">
        <div className="flex gap-2">
          <select
            className="form-input"
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
            <button type="submit" className="btn-secondary h-full whitespace-nowrap">
              <Plus className="h-4 w-4" />
              セッション追加
            </button>
          </form>
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
            <TabButton active={activeTab === "teams"} onClick={() => setActiveTab("teams")} icon={<Users className="h-4 w-4" />} label="編成" />
            <TabButton active={activeTab === "live"} onClick={() => setActiveTab("live")} icon={<Activity className="h-4 w-4" />} label="ライブ" />
            <TabButton active={activeTab === "stats"} onClick={() => setActiveTab("stats")} icon={<BarChart3 className="h-4 w-4" />} label="スタッツ" />
          </div>

          {selectedSession.status === "confirmed" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              このセッションは確定済みです。管理者のみ編集できます。
            </div>
          ) : null}

          {activeTab === "teams" ? (
            <TeamsTab
              attendees={attendees}
              rev1Players={rev1Players}
              rev2Players={rev2Players}
              unassigned={unassigned}
              sessionId={selectedSession.id}
              locked={locked}
              onStart={() => setActiveTab("live")}
            />
          ) : null}

          {activeTab === "live" ? (
            <LiveTab
              session={selectedSession}
              games={games}
              goals={goals}
              selectedGame={selectedGame}
              selectedGameGoals={selectedGameGoals}
              rev1Players={rev1Players}
              rev2Players={rev2Players}
              playerById={playerById}
              locked={locked}
              selectedGameId={effectiveSelectedGameId}
              onGameChange={setSelectedGameId}
              onGoalModal={setGoalModal}
            />
          ) : null}

          {activeTab === "stats" ? (
            <StatsTab
              session={selectedSession}
              games={games}
              goals={goals}
              stats={stats}
              profile={profile}
              locked={locked}
            />
          ) : null}

          {goalModal && selectedGame ? (
            <GoalDialog
              modal={goalModal}
              game={selectedGame}
              players={goalModal.team === "rev1" ? rev1Players : rev2Players}
              playerById={playerById}
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
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition ${
        active ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50 hover:text-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TeamsTab({
  attendees,
  rev1Players,
  rev2Players,
  unassigned,
  sessionId,
  locked,
  onStart,
}: {
  attendees: Profile[];
  rev1Players: MatchPlayer[];
  rev2Players: MatchPlayer[];
  unassigned: Profile[];
  sessionId: string;
  locked: boolean;
  onStart: () => void;
}) {
  return (
    <section className="space-y-3">
      <p className="px-1 text-xs text-slate-500">出席者をREV1/REV2に振り分けます。タップで戻せます。</p>

      <div className="grid grid-cols-2 gap-3">
        <TeamColumn team="rev1" players={rev1Players} sessionId={sessionId} locked={locked} />
        <TeamColumn team="rev2" players={rev2Players} sessionId={sessionId} locked={locked} />
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
            unassigned.map((user) => (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2" key={user.id}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="w-8 text-xs text-slate-400">{user.uniform_no ?? "-"}</span>
                  <span>{getProfileDisplayName(user)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AssignButton sessionId={sessionId} userId={user.id} team="rev1" disabled={locked} />
                  <AssignButton sessionId={sessionId} userId={user.id} team="rev2" disabled={locked} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="btn-primary w-full"
        disabled={rev1Players.length === 0 || rev2Players.length === 0}
      >
        <CheckCircle2 className="h-4 w-4" />
        この編成でライブ入力へ
      </button>
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
            <form action={assignSessionPlayerAction} key={player.user_id}>
              <input type="hidden" name="session_id" value={sessionId} />
              <input type="hidden" name="user_id" value={player.user_id} />
              <input type="hidden" name="team" value="" />
              <button
                type="submit"
                disabled={locked}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm font-semibold ${TEAM_STYLES[team].button} disabled:opacity-70`}
              >
                <span className="w-7 text-xs opacity-70">{player.profile.uniform_no ?? "-"}</span>
                <span className="min-w-0 truncate">{getProfileDisplayName(player.profile)}</span>
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
  userId,
  team,
  disabled,
}: {
  sessionId: string;
  userId: string;
  team: MatchTeam;
  disabled: boolean;
}) {
  return (
    <form action={assignSessionPlayerAction}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="user_id" value={userId} />
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
  rev1Players,
  rev2Players,
  playerById,
  locked,
  selectedGameId,
  onGameChange,
  onGoalModal,
}: {
  session: MatchSession;
  games: MatchGame[];
  goals: MatchGoalRecord[];
  selectedGame: MatchGame | null;
  selectedGameGoals: MatchGoalRecord[];
  rev1Players: MatchPlayer[];
  rev2Players: MatchPlayer[];
  playerById: Map<string, Profile>;
  locked: boolean;
  selectedGameId: string;
  onGameChange: (gameId: string) => void;
  onGoalModal: (modal: GoalModal) => void;
}) {
  const score = selectedGame ? getGameScore(selectedGame, goals) : null;

  return (
    <section className="space-y-3">
      <div className="card p-3">
        <div className="mb-3 flex gap-2">
          <select className="form-input" value={selectedGameId} onChange={(event) => onGameChange(event.target.value)} disabled={games.length === 0}>
            {games.length === 0 ? <option value="">試合なし</option> : null}
            {games.map((game) => (
              <option value={game.id} key={game.id}>
                {getGameLabel(game, goals)}
              </option>
            ))}
          </select>
          <form action={addMatchGameAction}>
            <input type="hidden" name="session_id" value={session.id} />
            <button type="submit" className="btn-secondary h-full whitespace-nowrap" disabled={locked}>
              <Plus className="h-4 w-4" />
              試合追加
            </button>
          </form>
        </div>

        {selectedGame && score ? (
          <div className="space-y-3" key={selectedGame.id}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <ScoreBlock team="rev1" value={score.rev1} />
              <span className="pb-4 text-sm font-semibold text-slate-300">対</span>
              <ScoreBlock team="rev2" value={score.rev2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <GkSelect
                key={`${selectedGame.id}-rev1-${selectedGame.rev1_gk_id ?? "none"}`}
                gameId={selectedGame.id}
                team="rev1"
                players={rev1Players}
                defaultValue={selectedGame.rev1_gk_id ?? ""}
                locked={locked}
              />
              <GkSelect
                key={`${selectedGame.id}-rev2-${selectedGame.rev2_gk_id ?? "none"}`}
                gameId={selectedGame.id}
                team="rev2"
                players={rev2Players}
                defaultValue={selectedGame.rev2_gk_id ?? ""}
                locked={locked}
              />
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
        <GoalButton team="rev1" disabled={!selectedGame || rev1Players.length === 0 || locked} onClick={() => onGoalModal({ mode: "add", team: "rev1" })} />
        <GoalButton team="rev2" disabled={!selectedGame || rev2Players.length === 0 || locked} onClick={() => onGoalModal({ mode: "add", team: "rev2" })} />
      </div>

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
                scorer={playerById.get(goal.scorer_id)}
                assist={goal.assist_id ? playerById.get(goal.assist_id) : null}
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
        name="gk_id"
        defaultValue={defaultValue}
        className="form-input"
        disabled={locked}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">未設定</option>
        {players.map((player) => (
          <option value={player.user_id} key={player.user_id}>
            {player.profile.uniform_no ? `${player.profile.uniform_no} ` : ""}
            {getProfileDisplayName(player.profile)}
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
  scorer?: Profile;
  assist: Profile | null | undefined;
  locked: boolean;
  onEdit: () => void;
}) {
  const cancelled = Boolean(goal.cancelled_at);
  return (
    <div className={`rounded-md border-l-4 p-3 ${TEAM_STYLES[goal.team].soft} ${goal.team === "rev1" ? "border-l-amber-400" : "border-l-rose-400"} ${cancelled ? "opacity-55" : ""}`}>
      <div className="flex items-start gap-2">
        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${TEAM_STYLES[goal.team].text}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">
            {scorer ? getProfileDisplayName(scorer) : "不明な選手"}
            <span className="ml-2 text-xs font-medium text-slate-500">ゴール</span>
          </div>
          <div className="text-sm text-slate-700">
            <span className="text-xs text-slate-500">アシスト </span>
            <span className="font-semibold">{assist ? getProfileDisplayName(assist) : "なし"}</span>
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
  playerById,
  onClose,
  onSaved,
  locked,
}: {
  modal: Exclude<GoalModal, null>;
  game: MatchGame;
  players: MatchPlayer[];
  playerById: Map<string, Profile>;
  onClose: () => void;
  onSaved: () => void;
  locked: boolean;
}) {
  const isEdit = modal.mode === "edit";
  const team = modal.team;
  const defaultScorer = isEdit ? modal.goal.scorer_id : players[0]?.user_id ?? "";
  const defaultAssist = isEdit ? modal.goal.assist_id ?? "" : "";
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
            <select name="scorer_id" defaultValue={defaultScorer} className="form-input" required disabled={locked}>
              {players.map((player) => (
                <option value={player.user_id} key={player.user_id}>
                  {player.profile.uniform_no ? `${player.profile.uniform_no} ` : ""}
                  {getProfileDisplayName(player.profile)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-500">アシスト</span>
            <select name="assist_id" defaultValue={defaultAssist} className="form-input" disabled={locked}>
              <option value="">なし</option>
              {players.map((player) => (
                <option value={player.user_id} key={player.user_id}>
                  {player.profile.uniform_no ? `${player.profile.uniform_no} ` : ""}
                  {getProfileDisplayName(player.profile)}
                </option>
              ))}
            </select>
          </label>
          {isEdit ? (
            <p className="text-xs text-slate-500">
              現在: {getProfileDisplayName(playerById.get(modal.goal.scorer_id) ?? players[0]?.profile)}
            </p>
          ) : null}
          <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">
              キャンセル
            </button>
            <button type="submit" className={`btn-primary ${team === "rev1" ? "bg-amber-500 hover:bg-amber-600" : "bg-rose-500 hover:bg-rose-600"}`} disabled={locked || players.length === 0}>
              <Check className="h-4 w-4" />
              確定する
            </button>
          </div>
        </form>
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
}: {
  session: MatchSession;
  games: MatchGame[];
  goals: MatchGoalRecord[];
  stats: ReturnType<typeof computeSessionStats>;
  profile: Profile;
  locked: boolean;
}) {
  const totalRev1 = games.reduce((sum, game) => sum + getGameScore(game, goals).rev1, 0);
  const totalRev2 = games.reduce((sum, game) => sum + getGameScore(game, goals).rev2, 0);

  return (
    <section className="space-y-3">
      <div className="card p-3">
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-500">試合数</span>
          <span className="font-bold text-ink">{games.length}試合</span>
        </div>
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-500">REV1 合計</span>
          <span className="font-bold text-amber-800">{totalRev1}点</span>
        </div>
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-500">REV2 合計</span>
          <span className="font-bold text-rose-800">{totalRev2}点</span>
        </div>
      </div>

      <StatsTeamSection team="rev1" stats={stats.filter((row) => row.team === "rev1")} />
      <StatsTeamSection team="rev2" stats={stats.filter((row) => row.team === "rev2")} />

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
          <article className="card p-3" key={row.user.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="w-8 text-xs text-slate-400">{row.user.uniform_no ?? "-"}</span>
              <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{getProfileDisplayName(row.user)}</h3>
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
