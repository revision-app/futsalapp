create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('admin', 'member');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.event_type as enum ('practice', 'match', 'party');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.attendance_status as enum ('attending', 'absent', 'pending');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.member_role not null default 'member',
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  recovery_question text,
  recovery_answer_salt text,
  recovery_answer_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_key on public.profiles (lower(email));
create index if not exists profiles_must_change_password_idx on public.profiles (must_change_password);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint seasons_date_range check (end_date >= start_date)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  title text not null,
  event_type public.event_type not null,
  location text not null default '',
  event_date timestamptz not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.attendance_status not null default 'pending',
  updated_at timestamptz not null default now(),
  constraint uq_attendance_event_user unique (event_id, user_id)
);

create table if not exists public.mvp_votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  votee_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points in (1, 2, 3)),
  created_at timestamptz not null default now(),
  constraint uq_mvp_vote_event_voter_points unique (event_id, voter_id, points),
  constraint uq_mvp_vote_event_voter_votee unique (event_id, voter_id, votee_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists attendances_touch_updated_at on public.attendances;
create trigger attendances_touch_updated_at
before update on public.attendances
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.events enable row level security;
alter table public.attendances enable row level security;
alter table public.mvp_votes enable row level security;

drop policy if exists "profiles_select_members" on public.profiles;
create policy "profiles_select_members"
on public.profiles for select
to authenticated
using (public.is_active_member() or id = auth.uid());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "seasons_select_members" on public.seasons;
create policy "seasons_select_members"
on public.seasons for select
to authenticated
using (public.is_active_member());

drop policy if exists "seasons_admin_all" on public.seasons;
create policy "seasons_admin_all"
on public.seasons for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "events_select_members" on public.events;
create policy "events_select_members"
on public.events for select
to authenticated
using (public.is_active_member());

drop policy if exists "events_admin_all" on public.events;
create policy "events_admin_all"
on public.events for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "attendances_select_members" on public.attendances;
create policy "attendances_select_members"
on public.attendances for select
to authenticated
using (public.is_active_member());

drop policy if exists "attendances_self_insert" on public.attendances;
create policy "attendances_self_insert"
on public.attendances for insert
to authenticated
with check (user_id = auth.uid() and public.is_active_member());

drop policy if exists "attendances_self_update" on public.attendances;
create policy "attendances_self_update"
on public.attendances for update
to authenticated
using (user_id = auth.uid() and public.is_active_member())
with check (user_id = auth.uid() and public.is_active_member());

drop policy if exists "attendances_admin_all" on public.attendances;
create policy "attendances_admin_all"
on public.attendances for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "mvp_votes_select_members" on public.mvp_votes;
create policy "mvp_votes_select_members"
on public.mvp_votes for select
to authenticated
using (public.is_active_member());

drop policy if exists "mvp_votes_self_insert" on public.mvp_votes;
create policy "mvp_votes_self_insert"
on public.mvp_votes for insert
to authenticated
with check (voter_id = auth.uid() and public.is_active_member());

drop policy if exists "mvp_votes_self_update" on public.mvp_votes;
create policy "mvp_votes_self_update"
on public.mvp_votes for update
to authenticated
using (voter_id = auth.uid() and public.is_active_member())
with check (voter_id = auth.uid() and public.is_active_member());

drop policy if exists "mvp_votes_self_delete" on public.mvp_votes;
create policy "mvp_votes_self_delete"
on public.mvp_votes for delete
to authenticated
using (voter_id = auth.uid() and public.is_active_member());

drop policy if exists "mvp_votes_admin_all" on public.mvp_votes;
create policy "mvp_votes_admin_all"
on public.mvp_votes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
