-- 個人成績タブ（下部ナビ）のための変更。
--
-- * profiles.post: 役職（代表・幹事・会計など）。個人成績の POST 欄に表示する。管理者だけが変更できる。
-- * app_settings: アプリ全体の設定（1行だけ）。stats_visible_to_members が false の間は、
--   一般メンバーには個人成績タブを表示しない（管理者には常に表示する）。

alter table public.profiles
  add column if not exists post text;

create table if not exists public.app_settings (
  id boolean primary key default true,
  stats_visible_to_members boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_settings_single_row check (id)
);

insert into public.app_settings (id) values (true)
on conflict (id) do nothing;

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_members" on public.app_settings;
create policy "app_settings_select_members"
on public.app_settings for select
to authenticated
using (true);

drop policy if exists "app_settings_admin_all" on public.app_settings;
create policy "app_settings_admin_all"
on public.app_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
