-- Relax SELECT policies on match tables to use `to authenticated` + `using (true)`
-- instead of `is_active_member()`.
--
-- Supabase Realtime (postgres_changes) evaluates the subscriber's RLS policies
-- before delivering events.  The `is_active_member()` function calls `auth.uid()`
-- which does not resolve reliably in the Realtime context, causing events to be
-- silently dropped.  Replacing with `using (true)` scoped to `authenticated`
-- ensures all logged-in users receive Realtime events while still blocking
-- anonymous access.

-- match_goal_records
drop policy if exists "match_goal_records_select_members" on public.match_goal_records;
create policy "match_goal_records_select_members"
on public.match_goal_records for select
to authenticated
using (true);

-- match_sessions
drop policy if exists "match_sessions_select_members" on public.match_sessions;
create policy "match_sessions_select_members"
on public.match_sessions for select
to authenticated
using (true);

-- match_session_players
drop policy if exists "match_session_players_select_members" on public.match_session_players;
create policy "match_session_players_select_members"
on public.match_session_players for select
to authenticated
using (true);

-- match_games
drop policy if exists "match_games_select_members" on public.match_games;
create policy "match_games_select_members"
on public.match_games for select
to authenticated
using (true);
