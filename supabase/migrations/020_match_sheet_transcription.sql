-- 試合結果記録を「手書き用紙 → 後から転記」方式に切り替える。
--
-- * スコアは試合ごとの値として match_games.score_a / score_b に直接保存する。
-- * ゴール・アシストはセッション合計として match_session_players.goals / assists に保存する。
-- * 相手オウンゴールはチームごとに match_sessions.rev{1,2,3}_opponent_own_goals に保存する。
-- * 同時編集で他の人の入力を上書きしないよう、match_sessions.revision で楽観ロックする。
-- * 既存データ（match_player_game_stats）は新しい形式へ移す。旧テーブルは消さずに残す。

-- 1. 列の追加 -------------------------------------------------------------

alter table public.match_session_players
  add column if not exists goals integer not null default 0,
  add column if not exists assists integer not null default 0;

alter table public.match_session_players
  drop constraint if exists match_session_players_stats_non_negative,
  add constraint match_session_players_stats_non_negative check (goals >= 0 and assists >= 0);

alter table public.match_sessions
  add column if not exists rev1_opponent_own_goals integer not null default 0,
  add column if not exists rev2_opponent_own_goals integer not null default 0,
  add column if not exists rev3_opponent_own_goals integer not null default 0,
  add column if not exists revision integer not null default 0,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table public.match_sessions
  drop constraint if exists match_sessions_own_goals_non_negative,
  add constraint match_sessions_own_goals_non_negative check (
    rev1_opponent_own_goals >= 0 and rev2_opponent_own_goals >= 0 and rev3_opponent_own_goals >= 0
  );

-- 2. 既存データの移行 -------------------------------------------------------

-- 1セッション分の旧データ（試合ごとの選手ゴール・アシスト）を新しい形式へ移す。
-- * 試合のスコア = その試合・チームの選手ゴール合計（編成から外れた選手の分も含む。旧方式のスコアと同じ）
-- * 選手のゴール・アシスト = 編成上のチームと同じチームで記録された分のセッション合計
--   （旧方式の個人成績も、編成上のチームと一致する記録だけを集計していた）
-- すでにスコアが入っている試合があるセッションは、新方式で入力済みとみなして何もしない。
create or replace function public.convert_legacy_match_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.match_games
    where session_id = p_session_id
      and (score_a is not null or score_b is not null)
  ) then
    return false;
  end if;

  update public.match_games mg
  set score_a = coalesce((
        select sum(s.goals)
        from public.match_player_game_stats s
        where s.game_id = mg.id and s.team = mg.team_a
      ), 0),
      score_b = coalesce((
        select sum(s.goals)
        from public.match_player_game_stats s
        where s.game_id = mg.id and s.team = mg.team_b
      ), 0)
  where mg.session_id = p_session_id;

  update public.match_session_players sp
  set goals = coalesce(agg.goals, 0),
      assists = coalesce(agg.assists, 0)
  from (
    select p.id,
           sum(s.goals)::integer as goals,
           sum(s.assists)::integer as assists
    from public.match_session_players p
    join public.match_games g on g.session_id = p.session_id
    join public.match_player_game_stats s
      on s.game_id = g.id
     and s.team = p.team
     and (
       (p.user_id is not null and s.user_id = p.user_id)
       or (p.guest_id is not null and s.guest_id = p.guest_id)
     )
    where p.session_id = p_session_id
    group by p.id
  ) agg
  where sp.id = agg.id;

  return true;
end;
$$;

revoke all on function public.convert_legacy_match_session(uuid) from public;
revoke all on function public.convert_legacy_match_session(uuid) from anon;
revoke all on function public.convert_legacy_match_session(uuid) from authenticated;
grant execute on function public.convert_legacy_match_session(uuid) to service_role;

-- スコア列を追加し、初回適用のときだけ既存データを移す（再適用しても入力済みのデータを壊さない）
do $$
declare
  v_session record;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_games'
      and column_name = 'score_a'
  ) then
    return;
  end if;

  alter table public.match_games
    add column score_a integer,
    add column score_b integer;

  for v_session in select id from public.match_sessions loop
    perform public.convert_legacy_match_session(v_session.id);
  end loop;
end $$;

alter table public.match_games
  drop constraint if exists match_games_scores_non_negative,
  add constraint match_games_scores_non_negative check (
    (score_a is null or score_a >= 0) and (score_b is null or score_b >= 0)
  );

-- 3. 転記内容の一括保存 -----------------------------------------------------

-- 転記画面の内容（編成・試合・ゴール/アシスト・相手OG）を1トランザクションで保存する。
-- p_expected_revision が現在の revision と違う場合は、他の人が先に保存したとみなしてエラーにする。
--
-- p_players:  [{ "user_id": uuid|null, "guest_id": uuid|null, "team": "rev1", "goals": 0, "assists": 0 }, ...]
-- p_games:    [{ "id": uuid|null, "team_a": "rev1", "team_b": "rev2", "score_a": int|null, "score_b": int|null,
--               "gk_a_user_id": uuid|null, "gk_a_guest_id": uuid|null, "gk_b_user_id": uuid|null, "gk_b_guest_id": uuid|null }, ...]
--             配列の順番がそのまま試合番号（1, 2, 3, ...）になる。
-- p_own_goals: { "rev1": 0, "rev2": 0, "rev3": 0 }
--
-- 出欠が「出席」になっていないメンバーを編成に入れた場合は、その人の出欠を「出席」にする。
create or replace function public.save_match_session_sheet(
  p_session_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_players jsonb,
  p_games jsonb,
  p_own_goals jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.match_sessions%rowtype;
  v_game jsonb;
  v_index integer := 0;
  v_game_id uuid;
  v_team_a public.match_team;
  v_team_b public.match_team;
  v_gk_a_user uuid;
  v_gk_a_guest uuid;
  v_gk_b_user uuid;
  v_gk_b_guest uuid;
  v_kept_ids uuid[];
begin
  select * into v_session
  from public.match_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Session not found.';
  end if;

  if v_session.revision <> p_expected_revision then
    raise exception 'match_session_revision_conflict' using errcode = 'P0409';
  end if;

  -- 編成
  if exists (
    select 1
    from jsonb_array_elements(p_players) p
    where (p->>'team') is null
       or not ((p->>'team') = any (case when v_session.team_count = 3 then array['rev1','rev2','rev3'] else array['rev1','rev2'] end))
  ) then
    raise exception 'Invalid team for this session.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_players) p
    where p->>'guest_id' is not null
      and not exists (
        select 1 from public.event_guests g
        where g.id = (p->>'guest_id')::uuid and g.event_id = v_session.event_id
      )
  ) then
    raise exception 'Guest does not belong to this event.';
  end if;

  delete from public.match_session_players where session_id = p_session_id;

  insert into public.match_session_players (session_id, user_id, guest_id, team, goals, assists)
  select p_session_id,
         nullif(p->>'user_id', '')::uuid,
         nullif(p->>'guest_id', '')::uuid,
         (p->>'team')::public.match_team,
         coalesce((p->>'goals')::integer, 0),
         coalesce((p->>'assists')::integer, 0)
  from jsonb_array_elements(p_players) p;

  insert into public.attendances (event_id, user_id, status)
  select v_session.event_id, sp.user_id, 'attending'
  from public.match_session_players sp
  where sp.session_id = p_session_id
    and sp.user_id is not null
  on conflict (event_id, user_id) do update
  set status = 'attending'
  where public.attendances.status <> 'attending';

  -- 試合（既存の試合は id を保ったまま更新し、番号を振り直す）
  select coalesce(array_agg((g->>'id')::uuid), '{}')
    into v_kept_ids
  from jsonb_array_elements(p_games) g
  where nullif(g->>'id', '') is not null;

  delete from public.match_games
  where session_id = p_session_id
    and not (id = any (v_kept_ids));

  if exists (
    select 1 from unnest(v_kept_ids) kept_id
    where not exists (select 1 from public.match_games where id = kept_id and session_id = p_session_id)
  ) then
    raise exception 'Game not found in this session.';
  end if;

  -- 一意制約（session_id, game_no）にぶつからないよう、いったん大きな番号へ退避する
  update public.match_games
  set game_no = game_no + 1000000
  where session_id = p_session_id;

  for v_game in select value from jsonb_array_elements(p_games) loop
    v_index := v_index + 1;
    v_team_a := (v_game->>'team_a')::public.match_team;
    v_team_b := (v_game->>'team_b')::public.match_team;
    v_gk_a_user := nullif(v_game->>'gk_a_user_id', '')::uuid;
    v_gk_a_guest := nullif(v_game->>'gk_a_guest_id', '')::uuid;
    v_gk_b_user := nullif(v_game->>'gk_b_user_id', '')::uuid;
    v_gk_b_guest := nullif(v_game->>'gk_b_guest_id', '')::uuid;

    if v_session.team_count <> 3 and not (v_team_a = 'rev1' and v_team_b = 'rev2') then
      raise exception 'Invalid teams for this session.';
    end if;

    if (v_gk_a_user is not null or v_gk_a_guest is not null) and not exists (
      select 1 from public.match_session_players sp
      where sp.session_id = p_session_id and sp.team = v_team_a
        and (sp.user_id = v_gk_a_user or sp.guest_id = v_gk_a_guest)
    ) then
      raise exception 'GK must belong to the team.';
    end if;

    if (v_gk_b_user is not null or v_gk_b_guest is not null) and not exists (
      select 1 from public.match_session_players sp
      where sp.session_id = p_session_id and sp.team = v_team_b
        and (sp.user_id = v_gk_b_user or sp.guest_id = v_gk_b_guest)
    ) then
      raise exception 'GK must belong to the team.';
    end if;

    v_game_id := nullif(v_game->>'id', '')::uuid;
    if v_game_id is null then
      insert into public.match_games (session_id, game_no, team_a, team_b)
      values (p_session_id, v_index, v_team_a, v_team_b)
      returning id into v_game_id;
    end if;

    update public.match_games
    set game_no = v_index,
        team_a = v_team_a,
        team_b = v_team_b,
        score_a = (v_game->>'score_a')::integer,
        score_b = (v_game->>'score_b')::integer,
        rev1_gk_id = case when v_team_a = 'rev1' then v_gk_a_user when v_team_b = 'rev1' then v_gk_b_user end,
        rev1_gk_guest_id = case when v_team_a = 'rev1' then v_gk_a_guest when v_team_b = 'rev1' then v_gk_b_guest end,
        rev2_gk_id = case when v_team_a = 'rev2' then v_gk_a_user when v_team_b = 'rev2' then v_gk_b_user end,
        rev2_gk_guest_id = case when v_team_a = 'rev2' then v_gk_a_guest when v_team_b = 'rev2' then v_gk_b_guest end,
        rev3_gk_id = case when v_team_a = 'rev3' then v_gk_a_user when v_team_b = 'rev3' then v_gk_b_user end,
        rev3_gk_guest_id = case when v_team_a = 'rev3' then v_gk_a_guest when v_team_b = 'rev3' then v_gk_b_guest end
    where id = v_game_id;
  end loop;

  update public.match_sessions
  set rev1_opponent_own_goals = coalesce((p_own_goals->>'rev1')::integer, 0),
      rev2_opponent_own_goals = coalesce((p_own_goals->>'rev2')::integer, 0),
      rev3_opponent_own_goals = case when v_session.team_count = 3 then coalesce((p_own_goals->>'rev3')::integer, 0) else 0 end,
      revision = revision + 1,
      updated_by = p_actor_id
  where id = p_session_id
  returning revision into v_session.revision;

  return v_session.revision;
end;
$$;

revoke all on function public.save_match_session_sheet(uuid, integer, uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.save_match_session_sheet(uuid, integer, uuid, jsonb, jsonb, jsonb) from anon;
revoke all on function public.save_match_session_sheet(uuid, integer, uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.save_match_session_sheet(uuid, integer, uuid, jsonb, jsonb, jsonb) to service_role;

-- 編成タブでの変更・確定・確定取消でも revision を進め、転記画面を開いている人に変更を気づかせる
create or replace function public.touch_match_session(p_session_id uuid, p_actor_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.match_sessions
  set revision = revision + 1,
      updated_by = p_actor_id
  where id = p_session_id
  returning revision;
$$;

revoke all on function public.touch_match_session(uuid, uuid) from public;
revoke all on function public.touch_match_session(uuid, uuid) from anon;
revoke all on function public.touch_match_session(uuid, uuid) from authenticated;
grant execute on function public.touch_match_session(uuid, uuid) to service_role;
