create table if not exists public.event_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  display_name text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_guests_display_name_not_blank check (char_length(btrim(display_name)) > 0),
  constraint uq_event_guests_event_display_name unique (event_id, display_name)
);

create index if not exists event_guests_event_id_idx on public.event_guests (event_id, created_at);

drop trigger if exists event_guests_touch_updated_at on public.event_guests;
create trigger event_guests_touch_updated_at
before update on public.event_guests
for each row execute function public.touch_updated_at();

alter table public.event_guests enable row level security;

drop policy if exists "event_guests_select_members" on public.event_guests;
create policy "event_guests_select_members"
on public.event_guests for select
to authenticated
using (public.is_active_member());

drop policy if exists "event_guests_admin_all" on public.event_guests;
create policy "event_guests_admin_all"
on public.event_guests for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.match_session_players
  alter column user_id drop not null,
  add column if not exists guest_id uuid references public.event_guests(id) on delete cascade;

alter table public.match_session_players
  drop constraint if exists uq_match_session_players_session_user;

drop index if exists uq_match_session_players_session_user;
create unique index if not exists uq_match_session_players_session_user
on public.match_session_players (session_id, user_id)
where user_id is not null;

create unique index if not exists uq_match_session_players_session_guest
on public.match_session_players (session_id, guest_id)
where guest_id is not null;

alter table public.match_session_players
  drop constraint if exists match_session_players_one_participant,
  add constraint match_session_players_one_participant check (
    ((user_id is not null)::integer + (guest_id is not null)::integer) = 1
  );

create index if not exists match_session_players_guest_id_idx on public.match_session_players (guest_id);

alter table public.match_games
  add column if not exists rev1_gk_guest_id uuid references public.event_guests(id) on delete set null,
  add column if not exists rev2_gk_guest_id uuid references public.event_guests(id) on delete set null;

alter table public.match_games
  drop constraint if exists match_games_one_rev1_gk,
  add constraint match_games_one_rev1_gk check (rev1_gk_id is null or rev1_gk_guest_id is null),
  drop constraint if exists match_games_one_rev2_gk,
  add constraint match_games_one_rev2_gk check (rev2_gk_id is null or rev2_gk_guest_id is null);

create index if not exists match_games_rev1_gk_guest_id_idx on public.match_games (rev1_gk_guest_id);
create index if not exists match_games_rev2_gk_guest_id_idx on public.match_games (rev2_gk_guest_id);

alter table public.match_goal_records
  alter column scorer_id drop not null,
  add column if not exists scorer_guest_id uuid references public.event_guests(id),
  add column if not exists assist_guest_id uuid references public.event_guests(id);

alter table public.match_goal_records
  drop constraint if exists match_goal_records_no_self_assist,
  drop constraint if exists match_goal_records_one_scorer,
  add constraint match_goal_records_one_scorer check (
    ((scorer_id is not null)::integer + (scorer_guest_id is not null)::integer) = 1
  ),
  drop constraint if exists match_goal_records_one_assist,
  add constraint match_goal_records_one_assist check (
    ((assist_id is not null)::integer + (assist_guest_id is not null)::integer) <= 1
  ),
  add constraint match_goal_records_no_self_assist check (
    (assist_id is null or scorer_id is null or assist_id <> scorer_id)
    and
    (assist_guest_id is null or scorer_guest_id is null or assist_guest_id <> scorer_guest_id)
  );

create index if not exists match_goal_records_scorer_guest_id_idx on public.match_goal_records (scorer_guest_id);
create index if not exists match_goal_records_assist_guest_id_idx on public.match_goal_records (assist_guest_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_rel
      where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
        and prrelid = 'public.event_guests'::regclass
    ) then
    alter publication supabase_realtime add table public.event_guests;
  end if;
end $$;
