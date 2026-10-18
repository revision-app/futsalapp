import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchTeam, MemberRole } from "@/lib/types";

const PASSWORD = "test-password-123";

export const admin = () => createAdminClient();

export type TestUser = { id: string; email: string };

/** テストごとに作ったデータを記録し、最後にまとめて消す */
export class Fixture {
  private readonly tag = randomUUID().slice(0, 8);
  private users: string[] = [];
  private seasons: string[] = [];

  async user(name: string, opts: { role?: MemberRole; uniformNo?: number } = {}): Promise<TestUser> {
    const email = `t-${this.tag}-${name}@test.local`;
    const { data, error } = await admin().auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `${name}-${this.tag}`, login_id: `t-${this.tag}-${name}` },
    });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    this.users.push(data.user.id);

    const { error: profileError } = await admin()
      .from("profiles")
      .update({ role: opts.role ?? "member", uniform_no: opts.uniformNo ?? null })
      .eq("id", data.user.id);
    if (profileError) throw profileError;

    return { id: data.user.id, email };
  }

  /** そのユーザーとしてログインしたクライアント（RLSが効く） */
  async clientAs(user: TestUser): Promise<SupabaseClient> {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
    if (error) throw error;
    return client;
  }

  async season(createdBy: TestUser): Promise<string> {
    const { data, error } = await admin()
      .from("seasons")
      .insert({ name: `test-${this.tag}`, start_date: "2026-01-01", end_date: "2026-12-31", created_by: createdBy.id })
      .select("id")
      .single();
    if (error || !data) throw error;
    this.seasons.push(data.id);
    return data.id;
  }

  async event(seasonId: string, createdBy: TestUser, attending: TestUser[] = []): Promise<string> {
    const { data, error } = await admin()
      .from("events")
      .insert({
        season_id: seasonId,
        title: `test-${this.tag}`,
        event_type: "practice",
        event_date: "2026-07-18T10:00:00+09:00",
        created_by: createdBy.id,
      })
      .select("id")
      .single();
    if (error || !data) throw error;

    if (attending.length > 0) {
      const { error: attendError } = await admin()
        .from("attendances")
        .upsert(attending.map((user) => ({ event_id: data.id, user_id: user.id, status: "attending" })), {
          onConflict: "event_id,user_id",
        });
      if (attendError) throw attendError;
    }
    return data.id;
  }

  async guest(eventId: string, createdBy: TestUser, name: string): Promise<string> {
    const { data, error } = await admin()
      .from("event_guests")
      .insert({ event_id: eventId, display_name: `${name}-${this.tag}`, created_by: createdBy.id })
      .select("id")
      .single();
    if (error || !data) throw error;
    return data.id;
  }

  /**
   * セッションと編成を作る。teams の各要素は [選手, チーム, ゴール, アシスト]（ゴール・アシストはセッション合計）。
   * 選手にゲストを使うときは { guestId } を渡す。
   */
  async session(
    eventId: string,
    createdBy: TestUser,
    teams: Array<[TestUser | { guestId: string }, MatchTeam, number?, number?]>,
    sessionNo = 1,
    opts: { teamCount?: 2 | 3; ownGoals?: Partial<Record<MatchTeam, number>> } = {}
  ): Promise<string> {
    const { data, error } = await admin()
      .from("match_sessions")
      .insert({
        event_id: eventId,
        session_no: sessionNo,
        created_by: createdBy.id,
        team_count: opts.teamCount ?? 2,
        rev1_opponent_own_goals: opts.ownGoals?.rev1 ?? 0,
        rev2_opponent_own_goals: opts.ownGoals?.rev2 ?? 0,
        rev3_opponent_own_goals: opts.ownGoals?.rev3 ?? 0,
      })
      .select("id")
      .single();
    if (error || !data) throw error;

    const { error: playerError } = await admin()
      .from("match_session_players")
      .insert(
        teams.map(([player, team, goals = 0, assists = 0]) => ({
          session_id: data.id,
          ...("guestId" in player ? { user_id: null, guest_id: player.guestId } : { user_id: player.id, guest_id: null }),
          team,
          goals,
          assists,
        }))
      );
    if (playerError) throw playerError;
    return data.id;
  }

  /**
   * 試合を作る。score を省略するとスコア未入力（旧方式のデータと同じ状態）になる。
   */
  async game(
    sessionId: string,
    gameNo: number,
    gks: Partial<Record<MatchTeam, TestUser>> = {},
    opts: { score?: [number, number]; teams?: [MatchTeam, MatchTeam] } = {}
  ): Promise<string> {
    const [teamA, teamB] = opts.teams ?? ["rev1", "rev2"];
    const { data, error } = await admin()
      .from("match_games")
      .insert({
        session_id: sessionId,
        game_no: gameNo,
        team_a: teamA,
        team_b: teamB,
        score_a: opts.score?.[0] ?? null,
        score_b: opts.score?.[1] ?? null,
        rev1_gk_id: gks.rev1?.id ?? null,
        rev2_gk_id: gks.rev2?.id ?? null,
        rev3_gk_id: gks.rev3?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !data) throw error;
    return data.id;
  }

  /** 旧方式（リアルタイム入力）の試合ごとの選手成績 */
  async playerStat(gameId: string, team: MatchTeam, player: TestUser | { guestId: string }, goals: number, assists = 0) {
    const { error } = await admin()
      .from("match_player_game_stats")
      .insert({
        game_id: gameId,
        team,
        ...("guestId" in player ? { guest_id: player.guestId } : { user_id: player.id }),
        goals,
        assists,
      });
    if (error) throw error;
  }

  async confirm(sessionId: string, by: TestUser) {
    const { error } = await admin()
      .from("match_sessions")
      .update({ status: "confirmed", confirmed_by: by.id, confirmed_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) throw error;
  }

  async cleanup() {
    // シーズンを消すとイベント→セッション→試合→成績まで連鎖して消える
    if (this.seasons.length > 0) await admin().from("seasons").delete().in("id", this.seasons);
    for (const id of this.users) await admin().auth.admin.deleteUser(id);
    this.users = [];
    this.seasons = [];
  }
}
