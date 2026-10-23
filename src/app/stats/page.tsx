import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { setStatsVisibilityAction } from "@/lib/actions/settings";
import { getStatsVisibleToMembers } from "@/lib/appSettings";
import { requireUser } from "@/lib/auth";
import { formatDateJst } from "@/lib/dates";
import { formatAverage, formatPercent, hasSeasonRecord, rankStats, type RankedStat } from "@/lib/personalStats";
import { getProfileDisplayName } from "@/lib/profile";
import { getSeasonMatchStats, type SeasonUserStats } from "@/lib/seasonMatchStats";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Season } from "@/lib/types";

type StatsPageProps = {
  searchParams?: Promise<{ season?: string }>;
};

function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

/** 指定がなければ、今日を含むシーズン、なければ一番新しいシーズン */
function pickSeason(seasons: Season[], requestedId?: string): Season | null {
  const today = todayJst();
  return (
    seasons.find((season) => season.id === requestedId) ??
    seasons.find((season) => season.start_date <= today && today <= season.end_date) ??
    seasons[0] ??
    null
  );
}

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const profile = await requireUser();
  const visibleToMembers = await getStatsVisibleToMembers();
  if (profile.role !== "admin" && !visibleToMembers) {
    redirect("/events");
  }

  const query = (await searchParams) ?? {};
  const admin = createAdminClient();
  const { data: seasonRows } = await admin.from("seasons").select("*").order("start_date", { ascending: false });
  const seasons = (seasonRows ?? []) as Season[];
  const season = pickSeason(seasons, query.season);
  const result = season ? await getSeasonMatchStats(season.id) : null;

  return (
    <AppShell profile={profile} active="stats" width="wide">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink">個人成績</h1>
        <p className="text-sm text-slate-500">
          {season ? `${season.name}（${formatDateJst(season.start_date)} - ${formatDateJst(season.end_date)}）` : "シーズンがありません"}
        </p>
      </div>

      {profile.role === "admin" ? <VisibilityCard visible={visibleToMembers} /> : null}

      {seasons.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {seasons.map((item) => (
            <Link
              key={item.id}
              href={`/stats?season=${item.id}`}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                item.id === season?.id ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-slate-600 hover:border-primary/40"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-5">
          <PersonalStatsTable stats={result.stats} eventCount={result.events.length} />
          <Rankings stats={result.stats} />
        </div>
      ) : (
        <div className="card p-6 text-center text-sm text-slate-500">シーズンを作成すると、ここに成績が表示されます。</div>
      )}
    </AppShell>
  );
}

function VisibilityCard({ visible }: { visible: boolean }) {
  return (
    <form action={setStatsVisibilityAction} className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
      <input type="hidden" name="visible" value={String(!visible)} />
      <div>
        <p className="text-sm font-bold text-ink">メンバーへの表示: {visible ? "表示中" : "非表示"}</p>
        <p className="text-xs text-slate-500">
          {visible ? "メンバーの下部メニューに「成績」タブが表示されています。" : "メンバーには「成績」タブ自体が表示されません（管理者だけが見られます）。"}
        </p>
      </div>
      <button type="submit" className={visible ? "btn-secondary" : "btn-primary"}>
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {visible ? "メンバーに非表示にする" : "メンバーに表示する"}
      </button>
    </form>
  );
}

const HEAD = "whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-bold text-slate-600";
const CELL = "whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-right tabular-nums";

function countWithRate(count: number, total: number): string {
  return `${count}回 (${formatPercent(count, total)})`;
}

function PersonalStatsTable({ stats, eventCount }: { stats: SeasonUserStats[]; eventCount: number }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-bold text-ink">個人成績</h2>
        <p className="text-xs text-slate-500">確定済みのセッションを集計（活動日 {eventCount}日）</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className={`${HEAD} sticky left-0 z-10 w-12 min-w-[3rem]`}>背番号</th>
              <th className={`${HEAD} sticky left-12 z-10 text-left`}>名前</th>
              <th className={HEAD}>POST</th>
              <th className={HEAD}>参加日数</th>
              <th className={HEAD}>試合数</th>
              <th className={HEAD}>勝ち</th>
              <th className={HEAD}>負け</th>
              <th className={HEAD}>引分け</th>
              <th className={HEAD}>ゴール数</th>
              <th className={HEAD}>アシスト数</th>
              <th className={HEAD}>セーブ率</th>
              <th className={HEAD}>GK回数</th>
              <th className={HEAD}>勝ち点</th>
              <th className={HEAD}>総得点(点/試合)</th>
              <th className={HEAD}>総失点(点/試合)</th>
              <th className={HEAD}>得失点</th>
              <th className={HEAD}>Gぽいん</th>
              <th className={HEAD}>Aぽいん</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, index) => {
              const stripe = index % 2 === 1 ? "bg-slate-50" : "bg-white";
              const goalDiff = row.teamGoalsFor - row.teamGoalsAgainst;
              const has = hasSeasonRecord(row);
              const played = row.games > 0;
              return (
                <tr key={row.user.id} className={stripe}>
                  <td className={`${CELL} ${stripe} sticky left-0 w-12 min-w-[3rem] text-center font-bold`}>{row.user.uniform_no ?? "-"}</td>
                  <td className={`${CELL} ${stripe} sticky left-12 text-left font-semibold text-ink`}>{getProfileDisplayName(row.user)}</td>
                  <td className={`${CELL} text-center text-slate-600`}>{row.user.post ?? ""}</td>
                  <td className={CELL}>{has ? `${row.attendanceDays}日 (${formatPercent(row.attendanceDays, eventCount)})` : "-"}</td>
                  <td className={CELL}>{played ? `${row.games}回` : "-"}</td>
                  <td className={CELL}>{played ? countWithRate(row.wins, row.games) : "-"}</td>
                  <td className={CELL}>{played ? countWithRate(row.losses, row.games) : "-"}</td>
                  <td className={CELL}>{played ? countWithRate(row.draws, row.games) : "-"}</td>
                  <td className={CELL}>{played ? `${row.goals} G` : "-"}</td>
                  <td className={CELL}>{played ? `${row.assists} A` : "-"}</td>
                  <td className={CELL}>{row.gkGames > 0 ? `${formatAverage(row.gkGoalsAgainst, row.gkGames)} (${row.gkGoalsAgainst}失点)` : "-"}</td>
                  <td className={CELL}>{played ? countWithRate(row.gkGames, row.games) : "-"}</td>
                  <td className={CELL}>{played ? row.points : "-"}</td>
                  <td className={CELL}>{played ? `${row.teamGoalsFor} (${formatAverage(row.teamGoalsFor, row.games)})` : "-"}</td>
                  <td className={CELL}>{played ? `${row.teamGoalsAgainst} (${formatAverage(row.teamGoalsAgainst, row.games)})` : "-"}</td>
                  <td className={`${CELL} ${goalDiff < 0 ? "text-rose-600" : ""}`}>{played ? goalDiff : "-"}</td>
                  <td className={CELL}>{played ? row.goalDays.size : "-"}</td>
                  <td className={CELL}>{played ? row.assistDays.size : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
        セーブ率は1試合あたりのGK時失点（小さいほど良い）。Gぽいん・Aぽいんは、ゴール・アシストした日数（1日に何点取っても1）。
      </p>
    </section>
  );
}

function Rankings({ stats }: { stats: SeasonUserStats[] }) {
  const goals = rankStats(stats, (row) => row.goals);
  const assists = rankStats(stats, (row) => row.assists);
  const keepers = rankStats(stats, (row) => row.gkGoalsAgainst / row.gkGames, {
    ascending: true,
    include: (row) => row.gkGames > 0,
  });

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-ink">ランキング</h2>
      <div className="grid gap-3 lg:grid-cols-3">
        <RankingTable title="ゴールランキング" valueLabel="ゴール数" rows={goals} renderValue={(row) => `${row.stats.goals} G`} />
        <RankingTable title="アシストランキング" valueLabel="アシスト数" rows={assists} renderValue={(row) => `${row.stats.assists} A`} />
        <RankingTable
          title="キーパーランキング"
          valueLabel="失点数 / GK回数 / セーブ率"
          rows={keepers}
          renderValue={(row) => `${row.stats.gkGoalsAgainst}失点 / ${row.stats.gkGames}回 / ${formatAverage(row.stats.gkGoalsAgainst, row.stats.gkGames)}`}
        />
      </div>
    </section>
  );
}

function RankingTable({
  title,
  valueLabel,
  rows,
  renderValue,
}: {
  title: string;
  valueLabel: string;
  rows: RankedStat[];
  renderValue: (row: RankedStat) => string;
}) {
  return (
    <div className="card overflow-hidden">
      <h3 className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm font-bold text-amber-950">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-3 py-5 text-center text-sm text-slate-400">対象者がいません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="px-2 py-1.5 text-center">順位</th>
              <th className="px-2 py-1.5 text-center">背番号</th>
              <th className="px-2 py-1.5 text-left">名前</th>
              <th className="px-2 py-1.5 text-right">{valueLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.stats.user.id}>
                <td className="px-2 py-1.5 text-center font-bold text-ink">{row.rank}位</td>
                <td className="px-2 py-1.5 text-center text-slate-500">{row.stats.user.uniform_no ?? "-"}</td>
                <td className="px-2 py-1.5 font-semibold text-ink">{getProfileDisplayName(row.stats.user)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{renderValue(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
