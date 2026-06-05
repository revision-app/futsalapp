create extension if not exists pgcrypto with schema extensions;

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

do $$
declare
  member record;
  v_user_id uuid;
  v_login_id text;
  v_email text;
begin
  for member in
    select *
    from (
      values
        (1::integer, 2::integer, '齋藤嘉史'::text, 'さいとうよしふみ'::text, 'saitoy'::text, 'member'::public.member_role),
        (2, 3, '山本信在', 'やまもとのぶあり', 'yamamoton', 'member'::public.member_role),
        (3, 4, '池内優', 'いけうちまさる', 'ikeuchim', 'admin'::public.member_role),
        (4, 5, '岩田斉伸', 'いわたきよのぶ', 'iwatak', 'member'::public.member_role),
        (5, 7, '野﨑栄次', 'のざきえいじ', 'nozakie', 'admin'::public.member_role),
        (6, 8, '長野陽平', 'ながのようへい', 'naganoy', 'member'::public.member_role),
        (7, 9, '塩屋真悟', 'しおやしんご', 'shioyas', 'member'::public.member_role),
        (8, 10, '岸本健史', 'きしもとたけし', 'kishimotot', 'member'::public.member_role),
        (9, 12, '倉田昌尚', 'くらたまさなお', 'kuratam', 'member'::public.member_role),
        (10, 15, '藤岡亮', 'ふじおかりょう', 'fujiokar', 'member'::public.member_role),
        (11, 16, '野田盛義', 'のだしげのり', 'nodas', 'member'::public.member_role),
        (12, 18, '仲野太智', 'なかのたいち', 'nakanot', 'member'::public.member_role),
        (13, 20, '渡部智行', 'わたなべともゆき', 'watanabet', 'member'::public.member_role),
        (14, 27, '衛藤裕一', 'えとうひろかず', 'etouh', 'member'::public.member_role),
        (15, 35, '馬渕祥吾', 'まぶちしょうご', 'mabuchis', 'member'::public.member_role),
        (16, 80, '百済圭祐', 'くだらけいすけ', 'kudarak', 'member'::public.member_role),
        (17, 59, '山本晃二', 'やまもとこうじ', 'yamamotok', 'member'::public.member_role),
        (18, 74, '葛野太暉', 'かどのたいき', 'kadonot', 'member'::public.member_role),
        (19, 77, '鈴木一弘', 'すずきかずひろ', 'suzukik', 'member'::public.member_role),
        (20, 40, '若林聖和', 'わかばやしせいわ', 'wakabayashis', 'member'::public.member_role),
        (21, 88, '藤岡猛', 'ふじおかたけし', 'fujiokat', 'member'::public.member_role),
        (22, 11, '飯国友生', 'いいくにともき', 'iikunit', 'member'::public.member_role),
        (null::integer, null::integer, '開発者', null::text, 'tagawah', 'admin'::public.member_role)
    ) as t(member_no, uniform_no, display_name, reading, login_id, role)
  loop
    v_login_id := lower(member.login_id);
    v_email := v_login_id || '@revision.local';

    select id
      into v_user_id
      from public.profiles
      where lower(login_id) = v_login_id
      limit 1;

    if v_user_id is null then
      select id
        into v_user_id
        from auth.users
        where lower(email) = lower(v_email)
        limit 1;
    end if;

    if v_user_id is null then
      select id
        into v_user_id
        from auth.users
        where lower(split_part(email, '@', 1)) = v_login_id
        limit 1;
    end if;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_sso_user,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        email_change_token_current,
        reauthentication_token,
        created_at,
        updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_email,
        extensions.crypt('password123', extensions.gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('display_name', member.display_name, 'login_id', v_login_id),
        false,
        '',
        '',
        '',
        '',
        '',
        '',
        now(),
        now()
      );
    else
      update auth.users
      set email = v_email,
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) ||
            jsonb_build_object('provider', 'email', 'providers', array['email']),
          raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
            jsonb_build_object('display_name', member.display_name, 'login_id', v_login_id),
          confirmation_token = '',
          recovery_token = '',
          email_change_token_new = '',
          email_change = '',
          email_change_token_current = '',
          reauthentication_token = '',
          updated_at = now()
      where id = v_user_id;
    end if;

    delete from auth.identities
    where user_id = v_user_id
      and provider = 'email';

    insert into auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    )
    on conflict (provider_id, provider) do update
      set id = excluded.id,
          user_id = excluded.user_id,
          identity_data = excluded.identity_data,
          updated_at = now();

    insert into public.profiles (
      id,
      email,
      display_name,
      member_no,
      uniform_no,
      reading,
      login_id,
      role,
      is_active,
      must_change_password
    )
    values (
      v_user_id,
      v_email,
      member.display_name,
      member.member_no,
      member.uniform_no,
      member.reading,
      v_login_id,
      member.role,
      true,
      true
    )
    on conflict (id) do update
      set email = excluded.email,
          display_name = excluded.display_name,
          member_no = excluded.member_no,
          uniform_no = excluded.uniform_no,
          reading = excluded.reading,
          login_id = excluded.login_id,
          role = excluded.role,
          is_active = true,
          must_change_password = case
            when public.profiles.recovery_answer_hash is not null then public.profiles.must_change_password
            else true
          end,
          updated_at = now();
  end loop;
end $$;
