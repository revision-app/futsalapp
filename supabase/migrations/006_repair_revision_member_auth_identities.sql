create extension if not exists pgcrypto with schema extensions;

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
        ('齋藤嘉史'::text, 'saitoy'::text, 'member'::public.member_role),
        ('山本信在', 'yamamoton', 'member'::public.member_role),
        ('池内優', 'ikeuchim', 'admin'::public.member_role),
        ('岩田斉伸', 'iwatak', 'member'::public.member_role),
        ('野﨑栄次', 'nozakie', 'admin'::public.member_role),
        ('長野陽平', 'naganoy', 'member'::public.member_role),
        ('塩屋真悟', 'shioyas', 'member'::public.member_role),
        ('岸本健史', 'kishimotot', 'member'::public.member_role),
        ('倉田昌尚', 'kuratam', 'member'::public.member_role),
        ('藤岡亮', 'fujiokar', 'member'::public.member_role),
        ('野田盛義', 'nodas', 'member'::public.member_role),
        ('仲野太智', 'nakanot', 'member'::public.member_role),
        ('渡部智行', 'watanabet', 'member'::public.member_role),
        ('衛藤裕一', 'etouh', 'member'::public.member_role),
        ('馬渕祥吾', 'mabuchis', 'member'::public.member_role),
        ('百済圭祐', 'kudarak', 'member'::public.member_role),
        ('山本晃二', 'yamamotok', 'member'::public.member_role),
        ('葛野太暉', 'kadonot', 'member'::public.member_role),
        ('鈴木一弘', 'suzukik', 'member'::public.member_role),
        ('若林聖和', 'wakabayashis', 'member'::public.member_role),
        ('藤岡猛', 'fujiokat', 'member'::public.member_role),
        ('飯国友生', 'iikunit', 'member'::public.member_role),
        ('開発者', 'tagawah', 'admin'::public.member_role)
    ) as t(display_name, login_id, role)
  loop
    v_login_id := lower(member.login_id);
    v_email := v_login_id || '@revision.local';

    select id
      into v_user_id
      from public.profiles
      where lower(login_id) = v_login_id
      limit 1;

    if v_user_id is null then
      raise notice 'profile not found: %', v_login_id;
      continue;
    end if;

    update auth.users
    set email = v_email,
        encrypted_password = extensions.crypt('password123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email']),
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

    update public.profiles
    set email = v_email,
        login_id = v_login_id,
        role = member.role,
        is_active = true,
        must_change_password = true,
        updated_at = now()
    where id = v_user_id;
  end loop;
end $$;
