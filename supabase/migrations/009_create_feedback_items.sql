do $$ begin
  create type public.feedback_type as enum ('opinion', 'request', 'bug', 'other');
exception
  when duplicate_object then null;
end $$;

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

alter table public.feedback_items enable row level security;

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
