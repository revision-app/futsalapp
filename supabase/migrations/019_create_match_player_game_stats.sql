create table if not exists public.match_player_game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.match_games(id) on delete cascade,
  team public.match_team not null,
  user_id uuid references public.profiles(id) on delete cascade,
  guest_id uuid references public.event_guests(id) on delete cascade,
  goals integer not null default 0,
  assists integer not null default 0,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_player_game_stats_one_participant check (
    ((user_id is not null)::integer + (guest_id is not null)::integer) = 1
  ),
  constraint match_player_game_stats_non_negative check (goals >= 0 and assists >= 0)
);

create unique index if not exists uq_match_player_game_stats_game_user
on public.match_player_game_stats (game_id, user_id)
where user_id is not null;

create unique index if not exists uq_match_player_game_stats_game_guest
on public.match_player_game_stats (game_id, guest_id)
where guest_id is not null;

create index if not exists match_player_game_stats_game_id_idx
on public.match_player_game_stats (game_id, team);

drop trigger if exists match_player_game_stats_touch_updated_at on public.match_player_game_stats;
create trigger match_player_game_stats_touch_updated_at
before update on public.match_player_game_stats
for each row execute function public.touch_updated_at();

insert into public.match_player_game_stats (game_id, team, user_id, goals, assists, created_by)
select game_id, team, scorer_id, count(*)::integer, 0, null::uuid
from public.match_goal_records
where cancelled_at is null and scorer_id is not null
group by game_id, team, scorer_id
on conflict (game_id, user_id) where user_id is not null do update
set goals = excluded.goals;

insert into public.match_player_game_stats (game_id, team, guest_id, goals, assists, created_by)
select game_id, team, scorer_guest_id, count(*)::integer, 0, null::uuid
from public.match_goal_records
where cancelled_at is null and scorer_guest_id is not null
group by game_id, team, scorer_guest_id
on conflict (game_id, guest_id) where guest_id is not null do update
set goals = excluded.goals;

insert into public.match_player_game_stats (game_id, team, user_id, goals, assists, created_by)
select game_id, team, assist_id, 0, count(*)::integer, null::uuid
from public.match_goal_records
where cancelled_at is null and assist_id is not null
group by game_id, team, assist_id
on conflict (game_id, user_id) where user_id is not null do update
set assists = excluded.assists;

insert into public.match_player_game_stats (game_id, team, guest_id, goals, assists, created_by)
select game_id, team, assist_guest_id, 0, count(*)::integer, null::uuid
from public.match_goal_records
where cancelled_at is null and assist_guest_id is not null
group by game_id, team, assist_guest_id
on conflict (game_id, guest_id) where guest_id is not null do update
set assists = excluded.assists;

create or replace function public.update_match_player_game_stat(
  p_game_id uuid,
  p_team public.match_team,
  p_user_id uuid,
  p_guest_id uuid,
  p_goals_delta integer,
  p_assists_delta integer,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if ((p_user_id is not null)::integer + (p_guest_id is not null)::integer) <> 1 then
    raise exception 'Exactly one participant is required.';
  end if;

  if p_user_id is not null then
    insert into public.match_player_game_stats (game_id, team, user_id, goals, assists, created_by, updated_by)
    values (p_game_id, p_team, p_user_id, greatest(p_goals_delta, 0), greatest(p_assists_delta, 0), p_actor_id, p_actor_id)
    on conflict (game_id, user_id) where user_id is not null do update
    set goals = greatest(public.match_player_game_stats.goals + p_goals_delta, 0),
        assists = greatest(public.match_player_game_stats.assists + p_assists_delta, 0),
        team = excluded.team,
        updated_by = p_actor_id,
        updated_at = now();
  else
    insert into public.match_player_game_stats (game_id, team, guest_id, goals, assists, created_by, updated_by)
    values (p_game_id, p_team, p_guest_id, greatest(p_goals_delta, 0), greatest(p_assists_delta, 0), p_actor_id, p_actor_id)
    on conflict (game_id, guest_id) where guest_id is not null do update
    set goals = greatest(public.match_player_game_stats.goals + p_goals_delta, 0),
        assists = greatest(public.match_player_game_stats.assists + p_assists_delta, 0),
        team = excluded.team,
        updated_by = p_actor_id,
        updated_at = now();
  end if;

  delete from public.match_player_game_stats
  where game_id = p_game_id
    and goals = 0
    and assists = 0
    and (
      (p_user_id is not null and user_id = p_user_id)
      or (p_guest_id is not null and guest_id = p_guest_id)
    );
end;
$$;

alter table public.match_player_game_stats enable row level security;

drop policy if exists "match_player_game_stats_select_members" on public.match_player_game_stats;
create policy "match_player_game_stats_select_members"
on public.match_player_game_stats for select
to authenticated
using (true);

drop policy if exists "match_player_game_stats_admin_all" on public.match_player_game_stats;
create policy "match_player_game_stats_admin_all"
on public.match_player_game_stats for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_rel
      where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and prrelid = 'public.match_player_game_stats'::regclass
    ) then
    alter publication supabase_realtime add table public.match_player_game_stats;
  end if;
end $$;