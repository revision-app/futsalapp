do $$ begin
  create type public.match_session_status as enum ('draft', 'confirmed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_team as enum ('rev1', 'rev2');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.match_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_no integer not null,
  status public.match_session_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_sessions_session_no_positive check (session_no > 0),
  constraint match_sessions_confirmed_consistent check (
    (status = 'draft' and confirmed_by is null and confirmed_at is null)
    or
    (status = 'confirmed' and confirmed_by is not null and confirmed_at is not null)
  ),
  constraint uq_match_sessions_event_session unique (event_id, session_no)
);

create table if not exists public.match_session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.match_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team public.match_team not null,
  created_at timestamptz not null default now(),
  constraint uq_match_session_players_session_user unique (session_id, user_id)
);

create table if not exists public.match_games (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.match_sessions(id) on delete cascade,
  game_no integer not null,
  rev1_gk_id uuid references public.profiles(id) on delete set null,
  rev2_gk_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_games_game_no_positive check (game_no > 0),
  constraint uq_match_games_session_game unique (session_id, game_no)
);

create table if not exists public.match_goal_records (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.match_games(id) on delete cascade,
  team public.match_team not null,
  scorer_id uuid not null references public.profiles(id),
  assist_id uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  cancelled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint match_goal_records_no_self_assist check (assist_id is null or assist_id <> scorer_id)
);

create index if not exists match_sessions_event_id_idx on public.match_sessions (event_id, session_no);
create index if not exists match_session_players_session_id_idx on public.match_session_players (session_id, team);
create index if not exists match_session_players_user_id_idx on public.match_session_players (user_id);
create index if not exists match_games_session_id_idx on public.match_games (session_id, game_no);
create index if not exists match_goal_records_game_id_idx on public.match_goal_records (game_id, created_at);
create index if not exists match_goal_records_scorer_id_idx on public.match_goal_records (scorer_id);
create index if not exists match_goal_records_assist_id_idx on public.match_goal_records (assist_id);

drop trigger if exists match_sessions_touch_updated_at on public.match_sessions;
create trigger match_sessions_touch_updated_at
before update on public.match_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists match_games_touch_updated_at on public.match_games;
create trigger match_games_touch_updated_at
before update on public.match_games
for each row execute function public.touch_updated_at();

drop trigger if exists match_goal_records_touch_updated_at on public.match_goal_records;
create trigger match_goal_records_touch_updated_at
before update on public.match_goal_records
for each row execute function public.touch_updated_at();

alter table public.match_sessions enable row level security;
alter table public.match_session_players enable row level security;
alter table public.match_games enable row level security;
alter table public.match_goal_records enable row level security;

drop policy if exists "match_sessions_select_members" on public.match_sessions;
create policy "match_sessions_select_members"
on public.match_sessions for select
to authenticated
using (public.is_active_member());

drop policy if exists "match_session_players_select_members" on public.match_session_players;
create policy "match_session_players_select_members"
on public.match_session_players for select
to authenticated
using (public.is_active_member());

drop policy if exists "match_games_select_members" on public.match_games;
create policy "match_games_select_members"
on public.match_games for select
to authenticated
using (public.is_active_member());

drop policy if exists "match_goal_records_select_members" on public.match_goal_records;
create policy "match_goal_records_select_members"
on public.match_goal_records for select
to authenticated
using (public.is_active_member());

drop policy if exists "match_sessions_admin_all" on public.match_sessions;
create policy "match_sessions_admin_all"
on public.match_sessions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "match_session_players_admin_all" on public.match_session_players;
create policy "match_session_players_admin_all"
on public.match_session_players for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "match_games_admin_all" on public.match_games;
create policy "match_games_admin_all"
on public.match_games for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "match_goal_records_admin_all" on public.match_goal_records;
create policy "match_goal_records_admin_all"
on public.match_goal_records for all
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
        and prrelid = 'public.match_sessions'::regclass
    ) then
    alter publication supabase_realtime add table public.match_sessions;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_rel
      where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and prrelid = 'public.match_session_players'::regclass
    ) then
    alter publication supabase_realtime add table public.match_session_players;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_rel
      where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and prrelid = 'public.match_games'::regclass
    ) then
    alter publication supabase_realtime add table public.match_games;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_rel
      where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and prrelid = 'public.match_goal_records'::regclass
    ) then
    alter publication supabase_realtime add table public.match_goal_records;
  end if;
end $$;
