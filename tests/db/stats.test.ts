import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSeasonMatchStats } from "@/lib/seasonMatchStats";
import { admin, Fixture, type TestUser } from "./helpers";

const fx = new Fixture();
let adminUser: TestUser;
let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  adminUser = await fx.user("admin", { role: "admin" });
  a = await fx.user("a", { uniformNo: 911 });
  b = await fx.user("b", { uniformNo: 912 });
});

afterAll(async () => {
  // 表示設定を初期値（非表示）に戻す
  await admin().from("app_settings").update({ stats_visible_to_members: false }).eq("id", true);
  await fx.cleanup();
});

describe("Gぽいん・Aぽいん（活動日単位）", () => {
  it("1日に何点取っても1。別の日にも取れば2", async () => {
    const season = await fx.season(adminUser);

    // 1日目: セッション2つとも a がゴール（計3点）、b がアシスト
    const day1 = await fx.event(season, adminUser, [a, b]);
    const s1 = await fx.session(day1, adminUser, [[a, "rev1", 2, 0], [b, "rev2", 0, 1]]);
    await fx.game(s1, 1, { rev1: a, rev2: b }, { score: [2, 0] });
    await fx.confirm(s1, adminUser);
    const s2 = await fx.session(day1, adminUser, [[a, "rev1", 1, 0], [b, "rev2", 0, 1]], 2);
    await fx.game(s2, 1, { rev1: a, rev2: b }, { score: [1, 0] });
    await fx.confirm(s2, adminUser);

    // 2日目: a がゴール。b はアシストなし
    const day2 = await fx.event(season, adminUser, [a, b]);
    const s3 = await fx.session(day2, adminUser, [[a, "rev1", 1, 0], [b, "rev2", 0, 0]]);
    await fx.game(s3, 1, { rev1: a, rev2: b }, { score: [1, 0] });
    await fx.confirm(s3, adminUser);

    // 3日目（下書き）: 数えない
    const day3 = await fx.event(season, adminUser, [a, b]);
    const s4 = await fx.session(day3, adminUser, [[a, "rev1", 0, 0], [b, "rev2", 1, 1]]);
    await fx.game(s4, 1, { rev1: a, rev2: b }, { score: [0, 1] });

    const result = await getSeasonMatchStats(season);
    const row = (user: TestUser) => result.stats.find((stat) => stat.user.id === user.id)!;

    expect(row(a)).toMatchObject({ goals: 4 });
    expect(row(a).goalDays.size).toBe(2);
    expect(row(a).assistDays.size).toBe(0);
    expect(row(b)).toMatchObject({ assists: 2 });
    expect(row(b).assistDays.size).toBe(1);
    expect(row(b).goalDays.size).toBe(0);
  });
});

describe("個人成績タブの表示設定（app_settings）", () => {
  it("初期値は「メンバーに非表示」で、1行だけある", async () => {
    const { data } = await admin().from("app_settings").select("*");
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ id: true });
  });

  it("一般メンバーは読めるが、変更できない", async () => {
    const member = await fx.clientAs(a);
    const { data, error } = await member.from("app_settings").select("stats_visible_to_members").single();
    expect(error).toBeNull();
    expect(typeof data?.stats_visible_to_members).toBe("boolean");

    await member.from("app_settings").update({ stats_visible_to_members: true }).eq("id", true);
    const { data: after } = await admin().from("app_settings").select("stats_visible_to_members").single();
    expect(after?.stats_visible_to_members).toBe(data?.stats_visible_to_members);
  });

  it("管理者は変更できる。2行目は作れない", async () => {
    const client = await fx.clientAs(adminUser);
    const { error } = await client.from("app_settings").update({ stats_visible_to_members: true }).eq("id", true);
    expect(error).toBeNull();
    const { data } = await admin().from("app_settings").select("stats_visible_to_members").single();
    expect(data?.stats_visible_to_members).toBe(true);

    const { error: insertError } = await admin().from("app_settings").insert({ id: false });
    expect(insertError?.message).toMatch(/app_settings_single_row/);
  });
});

describe("役職（profiles.post）", () => {
  it("管理者は設定でき、一般メンバーは自分の役職も変えられない", async () => {
    const client = await fx.clientAs(adminUser);
    expect((await client.from("profiles").update({ post: "幹事" }).eq("id", b.id)).error).toBeNull();

    const member = await fx.clientAs(b);
    await member.from("profiles").update({ post: "代表" }).eq("id", b.id);

    const { data } = await admin().from("profiles").select("post").eq("id", b.id).single();
    expect(data?.post).toBe("幹事");
  });
});
