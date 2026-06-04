alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists recovery_question text,
  add column if not exists recovery_answer_salt text,
  add column if not exists recovery_answer_hash text;

create index if not exists profiles_must_change_password_idx
on public.profiles (must_change_password);
