import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSeasonMatchStats } from "@/lib/seasonMatchStats";
import { admin, Fixture, type TestUser } from "./helpers";
import { legacySeasonStats } from "./legacySeasonStats";

const fx = new Fixture();
let adminUser: TestUser;
let a: TestUser;
let b: TestUser;
let c: TestUser;
let d: TestUser;
let e: TestUser;
let outsider: TestUser;

beforeAll(async () => {
  adminUser = await fx.user("admin", { role: "admin" });
  a = await fx.user("a", { uniformNo: 901 });
  b = await fx.user("b", { uniformNo: 902 });
  c = await fx.user("c", { uniformNo: 903 });
  d = await fx.user("d", { uniformNo: 904 });
  e = await fx.user("e", { uniformNo: 906 });
  outsider = await fx.user("outsider", { uniformNo: 905 });
});

afterAll(async () => {
  await fx.cleanup();
});

type SheetPlayer = { user_id?: string; guest_id?: string; team: string; goals?: number; assists?: number };
type SheetGame = {
  id?: string | null;
  team_a?: string;
  team_b?: string;
  score_a: number | null;
  score_b: number | null;
  gk_a_user_id?: string | null;
  gk_b_user_id?: string | null;
};

function saveSheet(sessionId: string, revision: number, players: SheetPlayer[], games: SheetGame[], ownGoals: Record<string, number> = {}) {
  return admin().rpc("save_match_session_sheet", {
    p_session_id: sessionId,
    p_expected_revision: revision,
    p_actor_id: adminUser.id,
    p_players: players.map((player) => ({ user_id: null, guest_id: null, goals: 0, assists: 0, ...player })),
    p_games: games.map((game) => ({ id: null, team_a: "rev1", team_b: "rev2", gk_a_user_id: null, gk_b_user_id: null, ...game })),
    p_own_goals: ownGoals,
  });
}

describe("マイグレーション", () => {
  it.each([
    "profiles",
    "seasons",
    "events",
    "attendances",
    "event_guests",
    "mvp_votes",
    "match_sessions",
    "match_session_players",
    "match_games",
    "match_goal_records",
    "match_player_game_stats",
  ])("テーブル %s がある", async (table) => {
    const { error } = await admin().from(table).select("*", { head: true, count: "exact" });
    expect(error).toBeNull();
  });

  it("転記方式の列がある（試合のスコア、セッション合計のゴール・アシスト、相手OG、revision）", async () => {
    const checks = await Promise.all([
      admin().from("match_games").select("score_a, score_b", { head: true }),
      admin().from("match_session_players").select("goals, assists", { head: true }),
      admin()
        .from("match_sessions")
        .select("rev1_opponent_own_goals, rev2_opponent_own_goals, rev3_opponent_own_goals, revision, updated_by", { head: true }),
    ]);
    for (const { error } of checks) expect(error).toBeNull();
  });
});

describe("制約", () => {
  it("ゴール・アシストに負の数は入らない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"]]);

    const { error } = await admin().from("match_session_players").update({ goals: -1 }).eq("session_id", session).eq("user_id", a.id);
    expect(error?.message).toMatch(/match_session_players_stats_non_negative/);
  });

  it("スコア・相手OGに負の数は入らない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"]]);

    const { error: scoreError } = await admin().from("match_games").insert({ session_id: session, game_no: 1, score_a: -1, score_b: 0 });
    expect(scoreError?.message).toMatch(/match_games_scores_non_negative/);

    const { error: ownGoalError } = await admin().from("match_sessions").update({ rev2_opponent_own_goals: -1 }).eq("id", session);
    expect(ownGoalError?.message).toMatch(/match_sessions_own_goals_non_negative/);
  });

  it("同じチーム同士の試合は作れない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser);
    const session = await fx.session(event, adminUser, [[a, "rev1"]]);

    const { error } = await admin().from("match_games").insert({ session_id: session, game_no: 1, team_a: "rev1", team_b: "rev1" });
    expect(error?.message).toMatch(/match_games_distinct_teams/);
  });

  it("確定者・確定日時なしでは確定状態にできない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser);
    const session = await fx.session(event, adminUser, [[a, "rev1"]]);

    const { error } = await admin().from("match_sessions").update({ status: "confirmed" }).eq("id", session);
    expect(error?.message).toMatch(/match_sessions_confirmed_consistent/);
  });

  it("試合を消すと後ろの試合番号が詰められる", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"]]);
    await fx.game(session, 1);
    const second = await fx.game(session, 2);
    const third = await fx.game(session, 3);

    const { error } = await admin().rpc("delete_match_game_and_renumber", { p_game_id: second });
    expect(error).toBeNull();

    const { data } = await admin().from("match_games").select("id, game_no").eq("session_id", session).order("game_no");
    expect(data).toEqual([
      { id: expect.any(String), game_no: 1 },
      { id: third, game_no: 2 },
    ]);
  });
});

describe("権限（RLS）", () => {
  it("一般メンバーは試合記録を読めるが、直接は書き込めない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a]);
    const session = await fx.session(event, adminUser, [[a, "rev1"]]);
    const member = await fx.clientAs(a);

    const { data: rows, error: readError } = await member.from("match_sessions").select("id").eq("id", session);
    expect(readError).toBeNull();
    expect(rows).toHaveLength(1);

    const { error: writeError } = await member.from("match_sessions").insert({ event_id: event, session_no: 2, created_by: a.id });
    expect(writeError?.message).toMatch(/row-level security/);
  });

  it("一般メンバーは転記の保存関数を直接呼べない（サーバー経由のみ）", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a]);
    const session = await fx.session(event, adminUser, [[a, "rev1"]]);
    const member = await fx.clientAs(a);

    const { error } = await member.rpc("save_match_session_sheet", {
      p_session_id: session,
      p_expected_revision: 0,
      p_actor_id: a.id,
      p_players: [],
      p_games: [],
      p_own_goals: {},
    });
    expect(error?.message).toMatch(/permission denied/);
  });

  it("管理者は直接書き込める", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser);
    const client = await fx.clientAs(adminUser);

    const { error } = await client.from("match_sessions").insert({ event_id: event, session_no: 1, created_by: adminUser.id });
    expect(error).toBeNull();
  });
});

describe("転記内容の保存（save_match_session_sheet）", () => {
  it("編成・ゴール/アシスト・試合・相手OGをまとめて保存し、revision と最終更新者を更新する", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b, c, d]);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [c, "rev2"]]);

    const { data: revision, error } = await saveSheet(
      session,
      0,
      [
        { user_id: a.id, team: "rev1", goals: 2, assists: 1 },
        { user_id: b.id, team: "rev1" },
        { user_id: c.id, team: "rev2", goals: 1 },
        { user_id: d.id, team: "rev2" },
      ],
      [
        { score_a: 2, score_b: 1, gk_a_user_id: b.id, gk_b_user_id: d.id },
        { score_a: 1, score_b: 0, gk_a_user_id: a.id, gk_b_user_id: c.id },
      ],
      { rev1: 1 }
    );
    expect(error).toBeNull();
    expect(revision).toBe(1);

    const { data: sessionRow } = await admin().from("match_sessions").select("*").eq("id", session).single();
    expect(sessionRow).toMatchObject({ revision: 1, updated_by: adminUser.id, rev1_opponent_own_goals: 1, rev2_opponent_own_goals: 0 });

    const { data: players } = await admin().from("match_session_players").select("user_id, team, goals, assists").eq("session_id", session);
    expect(players).toHaveLength(4);
    expect(players).toContainEqual({ user_id: a.id, team: "rev1", goals: 2, assists: 1 });

    const { data: games } = await admin()
      .from("match_games")
      .select("game_no, score_a, score_b, rev1_gk_id, rev2_gk_id")
      .eq("session_id", session)
      .order("game_no");
    expect(games).toEqual([
      { game_no: 1, score_a: 2, score_b: 1, rev1_gk_id: b.id, rev2_gk_id: d.id },
      { game_no: 2, score_a: 1, score_b: 0, rev1_gk_id: a.id, rev2_gk_id: c.id },
    ]);
  });

  it("既存の試合は id を保ったまま並べ替え・削除でき、試合番号を振り直す", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b]);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"]]);
    const first = await fx.game(session, 1, {}, { score: [1, 0] });
    await fx.game(session, 2, {}, { score: [0, 0] });
    const third = await fx.game(session, 3, {}, { score: [0, 2] });

    const { error } = await saveSheet(
      session,
      0,
      [{ user_id: a.id, team: "rev1" }, { user_id: b.id, team: "rev2" }],
      [
        { id: third, score_a: 0, score_b: 2 },
        { id: first, score_a: 1, score_b: 0 },
        { score_a: null, score_b: null },
      ]
    );
    expect(error).toBeNull();

    const { data } = await admin().from("match_games").select("id, game_no, score_a").eq("session_id", session).order("game_no");
    expect(data).toEqual([
      { id: third, game_no: 1, score_a: 0 },
      { id: first, game_no: 2, score_a: 1 },
      { id: expect.any(String), game_no: 3, score_a: null },
    ]);
  });

  it("他の人が先に保存していたら（revision が古ければ）保存しない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b]);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"]]);
    const players = [{ user_id: a.id, team: "rev1", goals: 1 }, { user_id: b.id, team: "rev2" }];

    expect((await saveSheet(session, 0, players, [{ score_a: 1, score_b: 0 }])).error).toBeNull();

    const { error } = await saveSheet(session, 0, players, [{ score_a: 5, score_b: 5 }]);
    expect(error?.code).toBe("P0409");

    const { data } = await admin().from("match_games").select("score_a").eq("session_id", session);
    expect(data).toEqual([{ score_a: 1 }]);
  });

  it("編成タブでの変更（touch_match_session）でも revision が進む", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a]);
    const session = await fx.session(event, adminUser, [[a, "rev1"]]);

    const { data } = await admin().rpc("touch_match_session", { p_session_id: session, p_actor_id: a.id });
    expect(data).toBe(1);
    expect((await saveSheet(session, 0, [{ user_id: a.id, team: "rev1" }], [])).error?.code).toBe("P0409");
  });

  it("出席になっていないメンバーを編成に入れると、その人を出席にする", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b]);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"]]);
    await admin().from("attendances").insert({ event_id: event, user_id: e.id, status: "absent" });

    const { error } = await saveSheet(session, 0, [
      { user_id: a.id, team: "rev1" },
      { user_id: b.id, team: "rev2" },
      { user_id: e.id, team: "rev2" },
      { user_id: outsider.id, team: "rev1" },
    ], []);
    expect(error).toBeNull();

    const { data } = await admin().from("attendances").select("user_id, status").eq("event_id", event).in("user_id", [e.id, outsider.id]);
    expect(data).toHaveLength(2);
    expect(data?.every((row) => row.status === "attending")).toBe(true);
  });

  it("GK にそのチームに編成されていない選手は指定できない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b]);
    const session = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"]]);

    const { error } = await saveSheet(
      session,
      0,
      [{ user_id: a.id, team: "rev1" }, { user_id: b.id, team: "rev2" }],
      [{ score_a: 0, score_b: 0, gk_a_user_id: b.id, gk_b_user_id: b.id }]
    );
    expect(error?.message).toMatch(/GK must belong to the team/);
  });

  it("2チームのセッションに REV3 の選手は入れられない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a]);
    const session = await fx.session(event, adminUser, [[a, "rev1"]]);

    const { error } = await saveSheet(session, 0, [{ user_id: a.id, team: "rev3" }], []);
    expect(error?.message).toMatch(/Invalid team/);
  });
});

describe("シーズン成績の集計（getSeasonMatchStats）", () => {
  it("確定済みセッションだけを集計し、保存したスコアから勝ち点・GK失点を計算する。相手OGは個人成績に入らない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b, c, d]);

    // 確定済み: REV1(a,b) vs REV2(c,d)。REV2 の 4 点のうち 1 点は REV1 のオウンゴール
    const confirmed = await fx.session(
      event,
      adminUser,
      [
        [a, "rev1", 0, 1],
        [b, "rev1", 2, 0],
        [c, "rev2", 1, 1],
        [d, "rev2", 2, 1],
      ],
      1,
      { ownGoals: { rev2: 1 } }
    );
    await fx.game(confirmed, 1, { rev1: a, rev2: c }, { score: [2, 1] });
    await fx.game(confirmed, 2, { rev1: b, rev2: c }, { score: [0, 3] });
    await fx.confirm(confirmed, adminUser);

    // 下書き: 集計に入らない
    const draft = await fx.session(event, adminUser, [[a, "rev1"], [outsider, "rev2", 5]], 2);
    await fx.game(draft, 1, { rev1: a, rev2: outsider }, { score: [0, 5] });

    const result = await getSeasonMatchStats(season);
    const row = (user: TestUser) => result.stats.find((stat) => stat.user.id === user.id)!;

    expect(row(a)).toMatchObject({ attendanceDays: 1, games: 2, wins: 1, losses: 1, points: 3, goals: 0, assists: 1, gkGames: 1, gkGoalsAgainst: 1 });
    expect(row(b)).toMatchObject({ games: 2, goals: 2, gkGames: 1, gkGoalsAgainst: 3, teamGoalsFor: 2, teamGoalsAgainst: 4 });
    expect(row(c)).toMatchObject({ games: 2, wins: 1, losses: 1, points: 3, goals: 1, assists: 1, gkGames: 2, gkGoalsAgainst: 2, teamGoalsFor: 4 });
    expect(row(d)).toMatchObject({ goals: 2, teamGoalsFor: 4 });
    expect(row(d)).not.toHaveProperty("goalGames");
    expect(result.stats.reduce((sum, stat) => sum + stat.goals, 0)).toBe(5); // 相手OG の 1 点は誰の得点にもならない
    expect(row(outsider)).toMatchObject({ attendanceDays: 0, games: 0, goals: 0 });
  });

  it("3チーム戦は、そのチームが出た試合だけを数える", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b, c]);
    const session = await fx.session(event, adminUser, [[a, "rev1", 1], [b, "rev2", 1], [c, "rev3", 2]], 1, { teamCount: 3 });
    await fx.game(session, 1, { rev1: a, rev2: b }, { score: [1, 0], teams: ["rev1", "rev2"] });
    await fx.game(session, 2, { rev2: b, rev3: c }, { score: [1, 1], teams: ["rev2", "rev3"] });
    await fx.game(session, 3, { rev3: c, rev1: a }, { score: [1, 0], teams: ["rev3", "rev1"] });
    await fx.confirm(session, adminUser);

    const result = await getSeasonMatchStats(season);
    const row = (user: TestUser) => result.stats.find((stat) => stat.user.id === user.id)!;

    expect(row(a)).toMatchObject({ games: 2, wins: 1, losses: 1, points: 3, gkGames: 2, gkGoalsAgainst: 1, goals: 1 });
    expect(row(b)).toMatchObject({ games: 2, draws: 1, losses: 1, points: 1, gkGames: 2, gkGoalsAgainst: 2 });
    expect(row(c)).toMatchObject({ games: 2, wins: 1, draws: 1, points: 4, gkGames: 2, gkGoalsAgainst: 1, goals: 2 });
  });
});

describe("既存データの移行（convert_legacy_match_session）", () => {
  it("移行の前後で、個人成績（Gぽいん・Aぽいんを除く）が変わらない", async () => {
    const season = await fx.season(adminUser);
    const event = await fx.event(season, adminUser, [a, b, c, d, e]);
    const guestId = await fx.guest(event, adminUser, "guest");
    const users = [a, b, c, d, e, outsider];

    // セッション1（確定済み・2チーム）: 旧方式の試合ごとの記録
    //  - e は途中で REV1 → REV2 に移された（REV1 として記録された 1 点は個人成績に入らないが、スコアには入る）
    //  - outsider は編成から外された（記録された 1 点はスコアにだけ入る）
    //  - ゲストのゴール・アシストもスコアには入る
    const s1 = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev1"], [{ guestId }, "rev1"], [c, "rev2"], [d, "rev2"], [e, "rev2"]]);
    const g1 = await fx.game(s1, 1, { rev1: a, rev2: c });
    await fx.playerStat(g1, "rev1", b, 2);
    await fx.playerStat(g1, "rev1", a, 0, 1);
    await fx.playerStat(g1, "rev1", { guestId }, 1, 1);
    await fx.playerStat(g1, "rev2", d, 1);
    const g2 = await fx.game(s1, 2, { rev1: b, rev2: e });
    await fx.playerStat(g2, "rev2", c, 2, 1);
    await fx.playerStat(g2, "rev2", d, 1, 1);
    await fx.playerStat(g2, "rev1", e, 1);
    await fx.playerStat(g2, "rev1", outsider, 1);
    await fx.game(s1, 3, { rev1: a }); // GK が片方だけ・得点なし
    await fx.confirm(s1, adminUser);

    // セッション2（確定済み・3チーム）
    const s2 = await fx.session(event, adminUser, [[a, "rev1"], [b, "rev2"], [c, "rev3"]], 2, { teamCount: 3 });
    const h1 = await fx.game(s2, 1, { rev1: a, rev2: b }, { teams: ["rev1", "rev2"] });
    await fx.playerStat(h1, "rev1", a, 1);
    const h2 = await fx.game(s2, 2, { rev2: b, rev3: c }, { teams: ["rev2", "rev3"] });
    await fx.playerStat(h2, "rev2", b, 1);
    await fx.playerStat(h2, "rev3", c, 1);
    const h3 = await fx.game(s2, 3, { rev3: c, rev1: a }, { teams: ["rev3", "rev1"] });
    await fx.playerStat(h3, "rev3", c, 2, 0);
    await fx.confirm(s2, adminUser);

    // セッション3（下書き）: どちらの方式でも集計に入らない
    const s3 = await fx.session(event, adminUser, [[a, "rev1"], [d, "rev2"]], 3);
    const k1 = await fx.game(s3, 1, { rev1: a, rev2: d });
    await fx.playerStat(k1, "rev2", d, 4);

    const sessionIds = [s1, s2, s3];
    const before = await legacySeasonStats(sessionIds, users.map((user) => user.id));

    for (const id of sessionIds) {
      const { data, error } = await admin().rpc("convert_legacy_match_session", { p_session_id: id });
      expect(error).toBeNull();
      expect(data).toBe(true);
    }

    const after = await getSeasonMatchStats(season);
    for (const user of users) {
      const row = after.stats.find((stat) => stat.user.id === user.id)!;
      const expected = before.get(user.id)!;
      expect({
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        points: row.points,
        goals: row.goals,
        assists: row.assists,
        gkGames: row.gkGames,
        gkGoalsAgainst: row.gkGoalsAgainst,
        teamGoalsFor: row.teamGoalsFor,
        teamGoalsAgainst: row.teamGoalsAgainst,
      }).toEqual(expected);
    }

    // 念のため、移行前の値が意味のある値になっていることも確かめる
    expect(before.get(e.id)).toMatchObject({ games: 3, goals: 0, gkGames: 1, gkGoalsAgainst: 2 });
    expect(before.get(c.id)).toMatchObject({ games: 5, goals: 5 });

    // スコアは試合ごとの選手ゴール合計（外れた選手・ゲストの分も含む）
    const { data: s1Games } = await admin().from("match_games").select("game_no, score_a, score_b").eq("session_id", s1).order("game_no");
    expect(s1Games).toEqual([
      { game_no: 1, score_a: 3, score_b: 1 },
      { game_no: 2, score_a: 2, score_b: 3 },
      { game_no: 3, score_a: 0, score_b: 0 },
    ]);

    // 2回目は何もしない（新方式で入力済みのデータを壊さない）
    await admin().from("match_session_players").update({ goals: 9 }).eq("session_id", s1).eq("user_id", a.id);
    const { data: again } = await admin().rpc("convert_legacy_match_session", { p_session_id: s1 });
    expect(again).toBe(false);
    const { data: kept } = await admin().from("match_session_players").select("goals").eq("session_id", s1).eq("user_id", a.id).single();
    expect(kept?.goals).toBe(9);
  });
});
