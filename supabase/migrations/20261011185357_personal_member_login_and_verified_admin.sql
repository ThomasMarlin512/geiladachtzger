
create table group_private.member_login_secrets(
 member_key text primary key references public.trip_attendance(roster_key) on delete cascade,
 secret_hash text not null check(length(secret_hash)=64),
 updated_at timestamptz not null default now()
);
alter table group_private.member_login_secrets enable row level security;
revoke all on group_private.member_login_secrets from public,anon,authenticated;

create or replace function group_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from group_private.admins a
 join public.trip_attendance t on t.roster_key=a.member_key
 join public.group_members m on m.user_id=t.user_id
 join auth.users u on u.id=m.user_id
 where m.user_id=auth.uid() and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,true))
$$;

create or replace function group_private.login_security_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
 select jsonb_build_object('has_personal_code',s.member_key is not null,
 'email_login',u.email_confirmed_at is not null,'is_admin',a.member_key is not null)
 into result from public.group_members m join auth.users u on u.id=m.user_id
 join public.trip_attendance t on t.user_id=m.user_id
 left join group_private.member_login_secrets s on s.member_key=t.roster_key
 left join group_private.admins a on a.member_key=t.roster_key where m.user_id=auth.uid();
 if result is null then raise exception 'Kein Gruppenzugang'; end if;
 return result;
end $$;

create or replace function group_private.issue_member_login_code(p_member_key text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own_key text; target_key text; target_user uuid; new_code text;
begin
 if auth.uid() is null or not public.is_group_member() then raise exception 'Anmeldung erforderlich'; end if;
 select roster_key into own_key from public.trip_attendance where user_id=auth.uid();
 target_key:=coalesce(p_member_key,own_key);
 if target_key is distinct from own_key and not group_private.is_admin() then raise exception 'Nur eigene Anmeldecodes dürfen geändert werden'; end if;
 select t.user_id into target_user from public.trip_attendance t join public.group_members m on m.user_id=t.user_id where t.roster_key=target_key for update of t;
 if target_user is null then raise exception 'Mitglied nicht gefunden'; end if;
 if exists(select 1 from group_private.admins where member_key=target_key)
 or exists(select 1 from auth.users where id=target_user and email_confirmed_at is not null)
 then raise exception 'Dieses Konto verwendet die bestätigte E-Mail-Anmeldung.'; end if;
 new_code:=encode(extensions.gen_random_bytes(16),'hex');
 insert into group_private.member_login_secrets(member_key,secret_hash)
 values(target_key,encode(extensions.digest(new_code,'sha256'),'hex'))
 on conflict(member_key) do update set secret_hash=excluded.secret_hash,updated_at=now();
 return jsonb_build_object('code',new_code);
end $$;
CREATE OR REPLACE FUNCTION group_private.recover_member_secure(p_code text, p_name text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_user uuid := auth.uid();
 v_name text;
 v_login text := lower(regexp_replace(btrim(coalesce(p_name,'')), '[[:space:]]+', ' ', 'g'));
 v_candidates integer;
 v_target uuid;
 v_count integer := 0;
 v_old uuid;
 v_vote record;
begin
 if v_user is null then raise exception 'Anmeldung erforderlich'; end if;
 if char_length(v_login) not between 2 and 100 then raise exception 'Ungültiger Name'; end if;
 if p_code is null or length(p_code)>256 then raise exception 'Name oder persönlicher Anmeldecode ungültig.'; end if;

 -- Name resolves the account; only its high-entropy personal secret may transfer it.
 select count(distinct m.user_id), min(m.display_name), (array_agg(distinct m.user_id))[1]
 into v_candidates,v_name,v_target
 from public.group_members m
 left join public.member_profiles profile on profile.user_id=m.user_id
 left join public.trip_attendance attendance on attendance.user_id=m.user_id
 left join public.group_people person on person.member_key=attendance.roster_key
 where lower(regexp_replace(btrim(m.display_name), '[[:space:]]+', ' ', 'g'))=v_login
    or lower(regexp_replace(btrim(profile.full_name), '[[:space:]]+', ' ', 'g'))=v_login
    or lower(regexp_replace(btrim(person.full_name), '[[:space:]]+', ' ', 'g'))=v_login;
 if v_candidates<>1 then raise exception 'Name oder persönlicher Anmeldecode ungültig. Bei bestätigter E-Mail bitte den Anmeldelink verwenden.'; end if;
 perform pg_advisory_xact_lock(hashtext(lower(v_name)));
 -- Full name and nickname serialize on the same canonical account.
 perform 1 from public.group_members where user_id=v_target and display_name=v_name for update;
 if not found then raise exception 'Die Anmeldung wurde zwischenzeitlich geändert. Bitte erneut versuchen.'; end if;
 -- Never detach a confirmed email identity or transfer an administrator.
 if exists(select 1 from auth.users where id=v_target and email_confirmed_at is not null)
 or exists(select 1 from public.trip_attendance t join group_private.admins a on a.member_key=t.roster_key where t.user_id=v_target)
 then raise exception 'Bitte mit deiner bestätigten E-Mail anmelden. Dieses Konto verwendet keinen Anmeldecode.'; end if;
 if not exists(
  select 1 from public.trip_attendance t join group_private.member_login_secrets s on s.member_key=t.roster_key
  where t.user_id=v_target and s.secret_hash=encode(extensions.digest(lower(btrim(p_code)),'sha256'),'hex')
 ) then raise exception 'Name oder persönlicher Anmeldecode ungültig. Erstelle deinen Code auf einem bereits angemeldeten Gerät unter Einstellungen oder wende dich an den Admin.'; end if;
 if exists(select 1 from public.group_members where user_id=v_user and lower(btrim(display_name))<>lower(v_name)) then
   raise exception 'Dieses Konto gehört bereits zu einem anderen Teilnehmer';
 end if;
 if not exists(select 1 from public.group_members where lower(btrim(display_name))=lower(v_name)) then
   raise exception 'Teilnehmer nicht gefunden';
 end if;
 for v_old in select user_id from public.group_members where lower(btrim(display_name))=lower(v_name) and user_id<>v_user order by joined_at,user_id loop
   for v_vote in select activity_id,choice,updated_at from public.votes where user_id=v_old loop
     insert into public.vote_recovery_archive(source_user_id,activity_id,choice,updated_at,recovered_to)
     values(v_old,v_vote.activity_id,v_vote.choice,v_vote.updated_at,v_user) on conflict do nothing;
     insert into public.votes(user_id,activity_id,choice,updated_at)
     values(v_user,v_vote.activity_id,v_vote.choice,v_vote.updated_at)
     on conflict(user_id,activity_id) do update set
       choice=case when excluded.updated_at>public.votes.updated_at then excluded.choice else public.votes.choice end,
       updated_at=greatest(public.votes.updated_at,excluded.updated_at);
     v_count:=v_count+1;
   end loop;
   -- Copy the private profile before moving the existing membership.
   insert into public.member_profiles(user_id,full_name,email,updated_at)
   select v_user,full_name,email,updated_at from public.member_profiles where user_id=v_old
   on conflict(user_id) do update set
    full_name=excluded.full_name,email=excluded.email,updated_at=excluded.updated_at
   where excluded.updated_at>public.member_profiles.updated_at;
   delete from public.votes where user_id=v_old;
   delete from public.group_members where user_id=v_old;
 end loop;
 insert into public.group_members(user_id,display_name) values(v_user,v_name)
 on conflict(user_id) do update set display_name=excluded.display_name;
 return v_count;
end; $function$;

create or replace function public.recover_kufstein_member(p_code text,p_name text) returns integer
language sql security invoker set search_path='' as $$ select group_private.recover_member_secure(p_code,p_name) $$;
create or replace function public.get_my_login_security() returns jsonb
language sql security invoker set search_path='' as $$ select group_private.login_security_state() $$;
create or replace function public.issue_member_login_code(p_member_key text default null) returns jsonb
language sql security invoker set search_path='' as $$ select group_private.issue_member_login_code(p_member_key) $$;

revoke all on function group_private.recover_member_secure(text,text),group_private.login_security_state(),group_private.issue_member_login_code(text),
public.recover_kufstein_member(text,text),public.get_my_login_security(),public.issue_member_login_code(text) from public,anon,authenticated;
grant execute on function group_private.recover_member_secure(text,text),group_private.login_security_state(),group_private.issue_member_login_code(text),
public.recover_kufstein_member(text,text),public.get_my_login_security(),public.issue_member_login_code(text) to authenticated;

CREATE OR REPLACE FUNCTION group_private.member_directory()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.is_group_member() then raise exception 'Kein Gruppenzugang'; end if;
 return jsonb_build_object('can_manage',group_private.is_admin(),'members',(
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'member_key',p.member_key,'full_name',p.full_name,'nickname',coalesce(m.display_name,t.nickname,''),
   'registered',m.user_id is not null,'is_self',coalesce(m.user_id=auth.uid(),false),
   'is_admin',a.member_key is not null
  ) order by lower(p.full_name)),'[]'::jsonb)
  from public.group_people p left join public.trip_attendance t on t.roster_key=p.member_key
  left join public.group_members m on m.user_id=t.user_id
  left join group_private.admins a on a.member_key=p.member_key
 ));
end $function$;
