do $$
begin
  if exists (
    select 1
    from pg_type
    join pg_enum on pg_enum.enumtypid = pg_type.oid
    where pg_type.typnamespace = 'public'::regnamespace
      and pg_type.typname = 'event_type'
      and pg_enum.enumlabel = 'match'
  ) then
    update public.events
    set event_type = 'practice'
    where event_type::text = 'match';
  end if;
end $$;
