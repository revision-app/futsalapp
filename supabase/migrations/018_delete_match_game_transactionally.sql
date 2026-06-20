create or replace function public.delete_match_game_and_renumber(p_game_id uuid)
returns table(event_id uuid, session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_session_id uuid;
  v_game_no integer;
begin
  select ms.event_id, mg.session_id, mg.game_no
    into v_event_id, v_session_id, v_game_no
  from public.match_games mg
  join public.match_sessions ms on ms.id = mg.session_id
  where mg.id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found.';
  end if;

  perform 1
  from public.match_games
  where match_games.session_id = v_session_id
  order by game_no
  for update;

  delete from public.match_games
  where id = p_game_id;

  update public.match_games
  set game_no = game_no - 1
  where match_games.session_id = v_session_id
    and game_no > v_game_no;

  return query select v_event_id, v_session_id;
end;
$$;

revoke all on function public.delete_match_game_and_renumber(uuid) from public;
revoke all on function public.delete_match_game_and_renumber(uuid) from anon;
revoke all on function public.delete_match_game_and_renumber(uuid) from authenticated;
grant execute on function public.delete_match_game_and_renumber(uuid) to service_role;
