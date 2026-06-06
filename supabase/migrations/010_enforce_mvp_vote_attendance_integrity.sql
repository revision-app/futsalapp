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

drop policy if exists "mvp_votes_select_members" on public.mvp_votes;
drop policy if exists "mvp_votes_self_select" on public.mvp_votes;
create policy "mvp_votes_self_select"
on public.mvp_votes for select
to authenticated
using (voter_id = auth.uid() and public.is_active_member());
