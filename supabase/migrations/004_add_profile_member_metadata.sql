alter table public.profiles
  add column if not exists member_no integer,
  add column if not exists uniform_no integer,
  add column if not exists reading text,
  add column if not exists login_id text;

create unique index if not exists profiles_login_id_key
on public.profiles (lower(login_id))
where login_id is not null;

update public.profiles
set login_id = lower(split_part(email, '@', 1))
where login_id is null
  and email is not null
  and email <> '';

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
