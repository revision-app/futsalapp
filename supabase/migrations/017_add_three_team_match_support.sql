alter table public.match_sessions
  add column if not exists team_count integer not null default 2;

alter table public.match_sessions
  drop constraint if exists match_sessions_team_count_valid,
  add constraint match_sessions_team_count_valid check (team_count in (2, 3));

alter table public.match_games
  add column if not exists team_a public.match_team not null default 'rev1',
  add column if not exists team_b public.match_team not null default 'rev2',
  add column if not exists rev3_gk_id uuid references public.profiles(id) on delete set null,
  add column if not exists rev3_gk_guest_id uuid references public.event_guests(id) on delete set null;

alter table public.match_games
  drop constraint if exists match_games_distinct_teams,
  add constraint match_games_distinct_teams check (team_a <> team_b),
  drop constraint if exists match_games_one_rev3_gk,
  add constraint match_games_one_rev3_gk check (rev3_gk_id is null or rev3_gk_guest_id is null);

create index if not exists match_games_rev3_gk_id_idx on public.match_games (rev3_gk_id);
create index if not exists match_games_rev3_gk_guest_id_idx on public.match_games (rev3_gk_guest_id);
