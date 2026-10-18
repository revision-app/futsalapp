"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Plus, Smartphone, Tablet, Trash2, Users, X } from "lucide-react";
import {
  assignSessionPlayerAction,
  confirmMatchSessionAction,
  createMatchSessionAction,
  deleteMatchSessionAction,
  reopenMatchSessionAction,
  updateMatchSessionTeamCountAction,
} from "@/lib/actions/matches";
import { MatchSheetEditor } from "@/components/matches/MatchSheetEditor";
import { TEAM_STYLES } from "@/components/matches/teamStyles";
import {
  checkSessionSheet,
  computeSessionStats,
  compareParticipants,
  describeSheetProblems,
  formatRatio,
  gameGkKey,
  getGameScore,
  getGameTeams,
  getOpponentOwnGoals,
  getParticipantDisplayName,
  getParticipantUniformNo,
  getSessionTeams,
  hasGameScore,
  sheetCheckInputFromRows,
  TEAM_LABELS,
  type MatchPlayer,
  type MatchParticipant,
  matchPlayerKey,
  participantKey,
} from "@/lib/matchStats";
import type { Event, MatchGame, MatchSession, MatchTeam, Profile } from "@/lib/types";

type TabId = "teams" | "sheet" | "stats";
type DisplayMode = "tablet" | "phone";

type DeleteModal = { kind: "session"; session: MatchSession } | null;

type MatchSessionClientProps = {
  event: Event;
  profile: Profile;
  attendees: MatchParticipant[];
  sessions: MatchSession[];
  selectedSession: MatchSession | null;
  players: MatchPlayer[];
  games: MatchGame[];
  members: MatchParticipant[];
  initialTab: TabId;
  initialDisplayMode: DisplayMode;
  error?: string;
};

const DISPLAY_MODE_COOKIE = "matchDisplayMode";
const UNSAVED_MESSAGE = "転記画面に保存していない変更があります。移動すると入力した内容は消えます。よろしいですか？";

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

function updatedAtLabel(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function persistDisplayMode(mode: DisplayMode) {
  document.cookie = `${DISPLAY_MODE_COOKIE}=${mode}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

export function MatchSessionClient({
  event,
  profile,
  attendees,
  sessions,
  selectedSession,
  players,
  games,
  members,
  initialTab,
  initialDisplayMode,
  error,
}: MatchSessionClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const displayMode = initialDisplayMode;
  const compactMode = displayMode === "phone";
  const [deleteModal, setDeleteModal] = useState<DeleteModal>(null);
  const [sheetDirty, setSheetDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    persistDisplayMode(displayMode);
  }, [displayMode]);

  const assignmentByKey = useMemo(() => new Map(players.map((player) => [matchPlayerKey(player), player.team])), [players]);
  const stats = useMemo(() => computeSessionStats(players, games), [players, games]);
  const activeTeams = selectedSession ? getSessionTeams(selectedSession) : (["rev1", "rev2"] satisfies MatchTeam[]);
  const playersByTeam = useMemo(
    () => Object.fromEntries(activeTeams.map((team) => [team, teamPlayers(players, team)])) as Record<MatchTeam, MatchPlayer[]>,
    [activeTeams, players]
  );
  const unassigned = attendees
    .filter((participant) => !assignmentByKey.has(participantKey(participant)))
    .sort(compareParticipants);
  const visibleTab = activeTab;
  const locked = selectedSession?.status === "confirmed" && profile.role !== "admin";
  const lastUpdatedLabel = useMemo(() => {
    if (!selectedSession?.updated_by) return null;
    const editor = members.find((member) => member.id === selectedSession.updated_by);
    return `${editor ? getParticipantDisplayName(editor) : "-"}（${updatedAtLabel(selectedSession.updated_at)}）`;
  }, [members, selectedSession]);
  const handleSheetDirtyChange = useCallback((dirty: boolean) => setSheetDirty(dirty), []);

  function confirmLeaveSheet(): boolean {
    if (!sheetDirty) return true;
    if (!window.confirm(UNSAVED_MESSAGE)) return false;
    setSheetDirty(false);
    return true;
  }

  function buildNavigationParams(sessionId: string | null, tab: TabId, mode: DisplayMode) {
    const params = new URLSearchParams();
    if (sessionId) params.set("session", sessionId);
    params.set("tab", tab);
    params.set("view", mode);
    return params;
  }

  function pushMatchRoute(params: URLSearchParams) {
    const query = params.toString();
    router.push(`/events/${event.id}/matches${query ? `?${query}` : ""}`);
  }

  function switchSession(sessionId: string) {
    if (!confirmLeaveSheet()) return;
    setNotice(null);
    pushMatchRoute(buildNavigationParams(sessionId, visibleTab, displayMode));
  }

  function switchTab(tab: TabId) {
    if (tab !== visibleTab && !confirmLeaveSheet()) return;
    setNotice(null);
    setActiveTab(tab);
    if (!selectedSession) return;
    pushMatchRoute(buildNavigationParams(selectedSession.id, tab, displayMode));
    router.refresh();
  }

  function switchDisplayMode(mode: DisplayMode) {
    if (!confirmLeaveSheet()) return;
    persistDisplayMode(mode);
    pushMatchRoute(buildNavigationParams(selectedSession?.id ?? null, visibleTab, mode));
    router.refresh();
  }

  return (
    <div className={`space-y-4 ${compactMode ? "" : "min-w-[48rem]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{eventDateLabel(event.event_date)}</p>
          <h1 className="truncate text-xl font-bold text-ink">試合結果</h1>
          <p className="mt-1 truncate text-sm text-slate-500">{event.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DisplayModeToggle value={displayMode} onChange={switchDisplayMode} />
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div> : null}

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
            {selectedSession?.status === "confirmed" ? "確定済み" : selectedSession ? "下書き" : "未作成"}
          </span>
        </div>

        <div className={`grid gap-2 ${compactMode ? "" : "grid-cols-[1fr_auto_auto]"}`}>
          <select
            className="form-input bg-white"
            value={selectedSession?.id ?? ""}
            onChange={(event) => switchSession(event.target.value)}
            disabled={sessions.length === 0}
          >
            {sessions.length === 0 ? <option value="">セッションなし</option> : null}
            {sessions.map((session) => (
              <option value={session.id} key={session.id}>
                セッション{session.session_no}・{session.status === "confirmed" ? "確定済み" : "下書き"}
              </option>
            ))}
          </select>
          <form action={createMatchSessionAction}>
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="display_mode" value={displayMode} />
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
            <input type="hidden" name="display_mode" value={displayMode} />
            <button type="submit" className="btn-primary">
              <Plus className="h-4 w-4" />
              セッション追加
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-white p-1">
            <TabButton active={visibleTab === "teams"} onClick={() => switchTab("teams")} icon={<Users className="h-4 w-4" />} label="編成" />
            <TabButton
              active={visibleTab === "sheet"}
              onClick={() => switchTab("sheet")}
              icon={<ClipboardList className="h-4 w-4" />}
              label="転記"
            />
            <TabButton
              active={visibleTab === "stats"}
              onClick={() => switchTab("stats")}
              icon={<BarChart3 className="h-4 w-4" />}
              label="スタッツ"
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
              games={games}
              locked={locked}
              compactMode={compactMode}
            />
          ) : null}

          {visibleTab === "sheet" ? (
            <MatchSheetEditor
              key={`${selectedSession.id}-${selectedSession.revision}`}
              session={selectedSession}
              teams={activeTeams}
              players={players}
              games={games}
              attendees={attendees}
              members={members}
              locked={locked}
              compactMode={compactMode}
              lastUpdatedLabel={lastUpdatedLabel}
              onDirtyChange={handleSheetDirtyChange}
              onSaved={() => {
                setNotice("一時保存しました。");
                setSheetDirty(false);
                router.refresh();
              }}
              onReload={() => {
                setSheetDirty(false);
                router.refresh();
              }}
            />
          ) : null}

          {visibleTab === "stats" ? (
            <StatsTab
              session={selectedSession}
              games={games}
              players={players}
              stats={stats}
              profile={profile}
              activeTeams={activeTeams}
              compactMode={compactMode}
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

function DisplayModeToggle({
  value,
  onChange,
}: {
  value: DisplayMode;
  onChange: (value: DisplayMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-md border border-slate-200 bg-white p-0.5 shadow-sm" aria-label="Display mode">
      {([
        { value: "tablet", label: "Tablet", icon: <Tablet className="h-3.5 w-3.5" /> },
        { value: "phone", label: "Phone", icon: <Smartphone className="h-3.5 w-3.5" /> },
      ] satisfies { value: DisplayMode; label: string; icon: React.ReactNode }[]).map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`flex h-8 items-center justify-center gap-1 rounded px-2 text-xs font-bold transition ${
            value === item.value ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50 hover:text-primary"
          }`}
          aria-pressed={value === item.value}
        >
          {item.icon}
          <span className="hidden sm:inline">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
function TeamsTab({
  attendees,
  session,
  activeTeams,
  playersByTeam,
  unassigned,
  games,
  locked,
  compactMode,
}: {
  attendees: MatchParticipant[];
  session: MatchSession;
  activeTeams: MatchTeam[];
  playersByTeam: Record<MatchTeam, MatchPlayer[]>;
  unassigned: MatchParticipant[];
  games: MatchGame[];
  locked: boolean;
  compactMode: boolean;
}) {
  const gameCount = games.length;
  const teamCountLocked = locked || gameCount > 0;
  const teamColumnsClass = compactMode
    ? "grid-cols-1"
    : activeTeams.length === 3
      ? "grid-cols-3"
      : "grid-cols-2";

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

      <div className={`grid gap-3 ${teamColumnsClass}`}>
        {activeTeams.map((team) => (
          <TeamColumn key={team} team={team} players={playersByTeam[team] ?? []} games={games} sessionId={session.id} locked={locked} />
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

function playerRecordSummary(player: MatchPlayer, games: MatchGame[]): string | null {
  const key = matchPlayerKey(player);
  const gkGames = games.filter((game) => getGameTeams(game).some((team) => team === player.team && gameGkKey(game, team) === key)).length;
  const parts: string[] = [];
  if (player.goals > 0) parts.push(`ゴール${player.goals}`);
  if (player.assists > 0) parts.push(`アシスト${player.assists}`);
  if (gkGames > 0) parts.push(`GK${gkGames}試合`);
  return parts.length > 0 ? parts.join("・") : null;
}

function TeamColumn({
  team,
  players,
  games,
  sessionId,
  locked,
}: {
  team: MatchTeam;
  players: MatchPlayer[];
  games: MatchGame[];
  sessionId: string;
  locked: boolean;
}) {
  const router = useRouter();

  return (
    <div className="card overflow-hidden">
      <div className={`px-3 py-2 text-center text-sm font-bold ${TEAM_STYLES[team].chip}`}>{TEAM_LABELS[team]} {players.length}人</div>
      <div className="space-y-2 p-2">
        {players.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-slate-400">未設定</div>
        ) : (
          players.map((player) => (
            <form
              action={async (formData) => {
                await assignSessionPlayerAction(formData);
                router.refresh();
              }}
              key={matchPlayerKey(player)}
              onSubmit={(event) => {
                const records = playerRecordSummary(player, games);
                if (
                  records &&
                  !window.confirm(
                    `${getParticipantDisplayName(player.participant)} には記録（${records}）があります。編成から外すとゴール・アシストは消え、GKの欄は「編成外」になります。よろしいですか？`
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
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
  const router = useRouter();

  return (
    <form
      action={async (formData) => {
        await assignSessionPlayerAction(formData);
        router.refresh();
      }}
    >
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

function DeleteConfirmDialog({
  modal,
  onClose,
}: {
  modal: Exclude<DeleteModal, null>;
  onClose: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const title = `セッション${modal.session.session_no}を削除`;
  const description = "このセッションの編成、試合、ゴール、アシスト、GK記録がすべて削除されます。";

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
          <form
            action={async (formData) => {
              setIsDeleting(true);
              await deleteMatchSessionAction(formData);
            }}
            className="grid grid-cols-[1fr_2fr] gap-2"
          >
            <input type="hidden" name="session_id" value={modal.session.id} />
            <button type="button" onClick={onClose} className="btn-secondary">
              キャンセル
            </button>
            <button type="submit" className="btn-danger" disabled={isDeleting}>
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "削除中..." : "削除する"}
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
  players,
  stats,
  profile,
  activeTeams,
  compactMode,
}: {
  session: MatchSession;
  games: MatchGame[];
  players: MatchPlayer[];
  stats: ReturnType<typeof computeSessionStats>;
  profile: Profile;
  activeTeams: MatchTeam[];
  compactMode: boolean;
}) {
  const totals = Object.fromEntries(
    activeTeams.map((team) => [team, games.reduce((sum, game) => sum + getGameScore(game)[team], 0)])
  ) as Record<MatchTeam, number>;
  const check = checkSessionSheet(sheetCheckInputFromRows(session, players, games));
  const problems = describeSheetProblems(check);
  const scoredGames = games.filter(hasGameScore).length;

  return (
    <section className="space-y-3">
      <div className="card p-3">
        <div className="flex justify-between py-1 text-sm">
          <span className="text-slate-500">試合数</span>
          <span className="font-bold text-ink">
            {games.length}試合{scoredGames < games.length ? `（スコア入力済み ${scoredGames}）` : ""}
          </span>
        </div>
        {activeTeams.map((team) => (
          <div className="flex justify-between py-1 text-sm" key={team}>
            <span className="text-slate-500">
              {TEAM_LABELS[team]} 合計
              {getOpponentOwnGoals(session, team) > 0 ? (
                <span className="ml-1 text-xs text-slate-400">（うち相手OG {getOpponentOwnGoals(session, team)}）</span>
              ) : null}
            </span>
            <span className={`font-bold ${TEAM_STYLES[team].text}`}>{totals[team]}点</span>
          </div>
        ))}
      </div>

      {session.status !== "confirmed" ? (
        problems.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="mb-1 font-bold">まだ確定できません（保存済みの内容でチェックしています）</p>
            <ul className="space-y-0.5">
              {problems.map((problem) => (
                <li key={problem}>・{problem}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            得点・GK・スコアのチェックはすべて通っています。
          </div>
        )
      ) : null}

      <div className={`grid gap-3 ${compactMode ? "" : "grid-cols-2"}`}>
        {activeTeams.map((team) => (
          <StatsTeamSection key={team} team={team} stats={stats.filter((row) => row.team === team)} />
        ))}
      </div>

      {profile.role === "admin" ? (
        session.status === "confirmed" ? (
          <form action={reopenMatchSessionAction}>
            <input type="hidden" name="session_id" value={session.id} />
            <button type="submit" className="btn-secondary w-full">
              下書きに戻す
            </button>
          </form>
        ) : (
          <form action={confirmMatchSessionAction}>
            <input type="hidden" name="session_id" value={session.id} />
            <button type="submit" className="btn-primary w-full" disabled={!check.canConfirm}>
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
