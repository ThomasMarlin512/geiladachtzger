-- Group-wide profile settings and a private, stable administrator role.
create schema if not exists group_private;
revoke all on schema group_private from public, anon, authenticated;
grant usage on schema group_private to authenticated;

create table group_private.admins (
 member_key text primary key references public.trip_attendance(roster_key),
 created_at timestamptz not null default now()
);
alter table group_private.admins enable row level security;
revoke all on group_private.admins from public, anon, authenticated;

-- Resolve the existing group owner by the verified name and nickname, never by a generated ID.
do $$
declare v_key text; v_count integer;
begin
 select count(*),min(t.roster_key) into v_count,v_key
 from public.group_people p join public.trip_attendance t on t.roster_key=p.member_key
 join public.group_members m on m.user_id=t.user_id
 where p.full_name='Thomas Marlin' and m.display_name='Büsel';
 if v_count<>1 then raise exception 'Gruppenverwaltung konnte nicht eindeutig zugeordnet werden'; end if;
 insert into group_private.admins(member_key) values(v_key);
end $$;

create function group_private.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from group_private.admins a
 join public.trip_attendance t on t.roster_key=a.member_key
 join public.group_members m on m.user_id=t.user_id
 where m.user_id=(select auth.uid())) $$;

create function group_private.member_directory()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.is_group_member() then raise exception 'Kein Gruppenzugang'; end if;
 return jsonb_build_object('can_manage',group_private.is_admin(),'members',(
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'full_name',p.full_name,'nickname',coalesce(m.display_name,t.nickname,''),
   'registered',m.user_id is not null,'is_self',coalesce(m.user_id=auth.uid(),false),
   'is_admin',a.member_key is not null
  ) order by lower(p.full_name)),'[]'::jsonb)
  from public.group_people p left join public.trip_attendance t on t.roster_key=p.member_key
  left join public.group_members m on m.user_id=t.user_id
  left join group_private.admins a on a.member_key=p.member_key
 ));
end $$;
create function public.get_group_member_directory()
returns jsonb language sql security invoker set search_path=''
as $$ select group_private.member_directory() $$;

create function group_private.update_member(
 p_person_id uuid,p_full_name text,p_nickname text,
 p_expected_full_name text,p_expected_nickname text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_person public.group_people%rowtype; v_user uuid; v_old_nick text;
 v_full text:=btrim(coalesce(p_full_name,'')); v_nick text:=btrim(coalesce(p_nickname,''));
begin
 if not group_private.is_admin() then raise exception 'Nur die Gruppenverwaltung kann andere Mitglieder bearbeiten'; end if;
 if char_length(v_full) not between 2 and 100 then raise exception 'Vollständiger Name muss 2 bis 100 Zeichen haben'; end if;
 select * into v_person from public.group_people where id=p_person_id for update;
 if not found then raise exception 'Mitglied nicht gefunden'; end if;
 select m.user_id,m.display_name into v_user,v_old_nick from public.trip_attendance t
 join public.group_members m on m.user_id=t.user_id where t.roster_key=v_person.member_key;
 if v_person.full_name is distinct from p_expected_full_name or coalesce(v_old_nick,'') is distinct from coalesce(p_expected_nickname,'') then
  raise exception 'Die Daten wurden inzwischen geändert. Bitte die Liste neu laden';
 end if;
 if v_user is not null then
  if char_length(v_nick) not between 2 and 50 then raise exception 'Nickname muss 2 bis 50 Zeichen haben'; end if;
  perform pg_advisory_xact_lock(hashtext(lower(v_nick)));
  if exists(select 1 from public.group_members where lower(btrim(display_name))=lower(v_nick) and user_id<>v_user) then
   raise exception 'Name ist bereits vergeben';
  end if;
  update public.group_members set display_name=v_nick where user_id=v_user;
  -- Keep private contact fields unchanged; only synchronize the public name.
  update public.member_profiles set full_name=v_full,updated_at=now() where user_id=v_user;
 elsif v_nick<>'' then
  raise exception 'Den Nickname legt das Mitglied bei der Anmeldung fest';
 end if;
 update public.group_people set full_name=v_full where id=p_person_id;
 return jsonb_build_object('id',p_person_id,'full_name',v_full,'nickname',v_nick);
end $$;
create function public.update_group_member(
 p_person_id uuid,p_full_name text,p_nickname text,p_expected_full_name text,p_expected_nickname text
) returns jsonb language sql security invoker set search_path=''
as $$ select group_private.update_member(p_person_id,p_full_name,p_nickname,p_expected_full_name,p_expected_nickname) $$;

revoke all on function group_private.is_admin() from public,anon,authenticated;
revoke all on function group_private.member_directory() from public,anon,authenticated;
revoke all on function group_private.update_member(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function group_private.member_directory(),group_private.update_member(uuid,text,text,text,text) to authenticated;
revoke all on function public.get_group_member_directory(),public.update_group_member(uuid,text,text,text,text) from public,anon;
grant execute on function public.get_group_member_directory(),public.update_group_member(uuid,text,text,text,text) to authenticated;
-- The directory is read-only through the table API. Mutations use the checked functions.
revoke insert,update,delete,truncate,references,trigger on public.group_people from authenticated,anon;

create or replace function public.get_my_kufstein_profile()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_profile jsonb;
begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
 select jsonb_build_object(
  'full_name',coalesce(g.full_name,p.full_name,''),'nickname',m.display_name,
  'email',coalesce(p.email,u.email,''),'login_email',coalesce(u.email,''),
  'login_email_confirmed',u.email_confirmed_at is not null
 ) into v_profile from public.group_members m
 left join public.member_profiles p on p.user_id=m.user_id
 left join public.trip_attendance t on t.user_id=m.user_id
 left join public.group_people g on g.member_key=t.roster_key
 left join auth.users u on u.id=m.user_id where m.user_id=auth.uid();
 if v_profile is null then raise exception 'Kein Gruppenzugang'; end if;
 return v_profile;
end $$;

create or replace function public.save_kufstein_profile(p_full_name text,p_nickname text,p_email text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_full text:=btrim(coalesce(p_full_name,'')); v_nick text:=btrim(coalesce(p_nickname,'')); v_email text:=btrim(coalesce(p_email,''));
begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
 if not public.is_group_member() then raise exception 'Kein Gruppenzugang'; end if;
 if char_length(v_full) not between 2 and 100 then raise exception 'Vollständiger Name muss 2 bis 100 Zeichen haben'; end if;
 if char_length(v_nick) not between 2 and 50 then raise exception 'Nickname muss 2 bis 50 Zeichen haben'; end if;
 if char_length(v_email)>254 or (v_email<>'' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then raise exception 'Bitte eine gültige E-Mail-Adresse eingeben'; end if;
 perform 1 from public.group_people p join public.trip_attendance t on t.roster_key=p.member_key where t.user_id=auth.uid() for update of p;
 perform public.rename_kufstein_member(v_nick);
 insert into public.member_profiles(user_id,full_name,email,updated_at) values(auth.uid(),v_full,v_email,now())
 on conflict(user_id) do update set full_name=excluded.full_name,email=excluded.email,updated_at=excluded.updated_at;
 update public.group_people p set full_name=v_full from public.trip_attendance t where t.roster_key=p.member_key and t.user_id=auth.uid();
 return public.get_my_kufstein_profile();
end $$;
