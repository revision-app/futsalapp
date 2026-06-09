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
