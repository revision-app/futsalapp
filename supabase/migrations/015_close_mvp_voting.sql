alter table public.events
add column if not exists mvp_voting_closed_at timestamptz;

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
      and event_type in ('practice', 'camp')
  ) then
    raise exception 'MVP votes are only allowed for practice or camp events.';
  end if;

  if exists (
    select 1
    from public.events
    where id = new.event_id
      and mvp_voting_closed_at is not null
  ) then
    raise exception 'MVP voting is closed for this event.';
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
before insert or update
on public.mvp_votes
for each row execute function public.prevent_invalid_mvp_vote();
