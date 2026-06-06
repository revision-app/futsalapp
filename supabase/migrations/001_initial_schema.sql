create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('admin', 'member');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.event_type as enum ('practice', 'party', 'camp');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.attendance_status as enum ('attending', 'absent', 'tentative', 'pending');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.feedback_type as enum ('opinion', 'request', 'bug', 'other');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  member_no integer,
  uniform_no integer,
  reading text,
  login_id text,
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
create unique index if not exists profiles_login_id_key on public.profiles (lower(login_id)) where login_id is not null;
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
  end_date timestamptz,
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
  constraint uq_mvp_vote_event_voter_votee unique (event_id, voter_id, votee_id)
);

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feedback_type public.feedback_type not null default 'opinion',
  title text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  constraint feedback_items_title_length check (char_length(title) <= 120),
  constraint feedback_items_body_not_blank check (char_length(btrim(body)) > 0),
  constraint feedback_items_body_length check (char_length(body) <= 2000)
);

create index if not exists feedback_items_created_at_idx on public.feedback_items (created_at desc);
create index if not exists feedback_items_user_id_idx on public.feedback_items (user_id);

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
  insert into public.profiles (id, email, display_name, login_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    lower(coalesce(new.raw_user_meta_data ->> 'login_id', split_part(coalesce(new.email, ''), '@', 1)))
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
        login_id = coalesce(nullif(excluded.login_id, ''), public.profiles.login_id);

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

create or replace function public.prevent_invalid_mvp_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.events
    where id = new.event_id
      and event_type = 'practice'
  ) then
    raise exception 'MVP votes are only allowed for practice events.';
  end if;

  if not exists (
    select 1
    from public.attendances
    where event_id = new.event_id
      and user_id = new.voter_id
      and status = 'attending'
  ) then
    raise exception 'MVP voters must be attending the event.';
  end if;

  if not exists (
    select 1
    from public.attendances
    where event_id = new.event_id
      and user_id = new.votee_id
      and status = 'attending'
  ) then
    raise exception 'MVP vote targets must be attending the event.';
  end if;

  return new;
end;
$$;

drop trigger if exists mvp_votes_validate_attendance on public.mvp_votes;
create trigger mvp_votes_validate_attendance
before insert or update of event_id, voter_id, votee_id
on public.mvp_votes
for each row execute function public.prevent_invalid_mvp_vote();

create or replace function public.prevent_member_mvp_attendance_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'attending'
    and auth.uid() is not null
    and not public.is_admin()
    and exists (
      select 1
      from public.mvp_votes
      where event_id = new.event_id
        and (voter_id = new.user_id or votee_id = new.user_id)
    )
  then
    raise exception 'Attendance cannot be changed from attending after related MVP votes exist.';
  end if;

  return new;
end;
$$;

drop trigger if exists attendances_prevent_mvp_conflict on public.attendances;
create trigger attendances_prevent_mvp_conflict
before insert or update of status
on public.attendances
for each row execute function public.prevent_member_mvp_attendance_conflict();

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.events enable row level security;
alter table public.attendances enable row level security;
alter table public.mvp_votes enable row level security;
alter table public.feedback_items enable row level security;

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
drop policy if exists "mvp_votes_self_select" on public.mvp_votes;
create policy "mvp_votes_self_select"
on public.mvp_votes for select
to authenticated
using (voter_id = auth.uid() and public.is_active_member());

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

drop policy if exists "feedback_items_self_select" on public.feedback_items;
create policy "feedback_items_self_select"
on public.feedback_items for select
to authenticated
using (user_id = auth.uid() and public.is_active_member());

drop policy if exists "feedback_items_self_insert" on public.feedback_items;
create policy "feedback_items_self_insert"
on public.feedback_items for insert
to authenticated
with check (user_id = auth.uid() and public.is_active_member());

drop policy if exists "feedback_items_admin_all" on public.feedback_items;
create policy "feedback_items_admin_all"
on public.feedback_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
