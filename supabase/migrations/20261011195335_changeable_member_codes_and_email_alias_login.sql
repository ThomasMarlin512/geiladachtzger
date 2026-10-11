-- User-requested sign-in: nickname/full name/email plus a changeable personal code.
alter table group_private.member_login_secrets drop constraint member_login_secrets_secret_hash_check;
alter table group_private.member_login_secrets add column is_initial boolean not null default false;

create table group_private.member_login_defaults(
 id boolean primary key default true check(id),
 code_hash text not null check(length(code_hash)=60)
);
alter table group_private.member_login_defaults enable row level security;
revoke all on group_private.member_login_defaults from public,anon,authenticated;
insert into group_private.member_login_defaults(id,code_hash) values(true,'$2a$10$iGUoh.Jpm/4HqqESTiQF9eOgheXRTIiO1HKBzeYBVVv/EUnP6fCJm');

-- Set the requested initial code once for all existing members; future changes
-- belong to each member, never to the shared group code.
insert into group_private.member_login_secrets(member_key,secret_hash,is_initial)
select roster_key,d.code_hash,true from public.trip_attendance cross join group_private.member_login_defaults d
on conflict(member_key) do update set secret_hash=excluded.secret_hash,is_initial=true,updated_at=now();
alter table group_private.member_login_secrets add constraint member_login_secrets_secret_hash_check check(length(secret_hash)=60);

create table group_private.member_login_attempts(
 bucket text primary key,
 failures integer not null default 0,
 last_failure timestamptz not null default now()
);
alter table group_private.member_login_attempts enable row level security;
revoke all on group_private.member_login_attempts from public,anon,authenticated;

create or replace function group_private.seed_member_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into group_private.member_login_secrets(member_key,secret_hash,is_initial)
 select new.roster_key,code_hash,true from group_private.member_login_defaults
 on conflict(member_key) do nothing;
 return new;
end $$;
revoke all on function group_private.seed_member_code() from public,anon,authenticated;
create trigger seed_member_login_code after insert or update of user_id on public.trip_attendance
for each row execute function group_private.seed_member_code();

create or replace function group_private.login_security_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
 select jsonb_build_object('has_personal_code',s.member_key is not null,'is_initial',coalesce(s.is_initial,true),
 'email_login',u.email_confirmed_at is not null,'is_admin',a.member_key is not null)
 into result from public.group_members m join auth.users u on u.id=m.user_id
 join public.trip_attendance t on t.user_id=m.user_id
 left join group_private.member_login_secrets s on s.member_key=t.roster_key
 left join group_private.admins a on a.member_key=t.roster_key where m.user_id=auth.uid();
 if result is null then raise exception 'Kein Gruppenzugang'; end if;
 return result;
end $$;

create or replace function group_private.change_my_login_code(p_current_code text,p_new_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare own_key text; old_hash text; new_code text:=btrim(coalesce(p_new_code,''));
begin
 if auth.uid() is null or not public.is_group_member() then raise exception 'Anmeldung erforderlich'; end if;
 select t.roster_key,s.secret_hash into own_key,old_hash from public.trip_attendance t
 join group_private.member_login_secrets s on s.member_key=t.roster_key where t.user_id=auth.uid() for update of s;
 if old_hash is null or p_current_code is null or octet_length(p_current_code)>72
 or extensions.crypt(btrim(p_current_code),old_hash) is distinct from old_hash then raise exception 'Der aktuelle Code ist nicht richtig.'; end if;
 if char_length(new_code) not between 4 and 64 or octet_length(new_code)>72 then raise exception 'Der neue Code muss 4 bis 64 Zeichen enthalten.'; end if;
 update group_private.member_login_secrets set secret_hash=extensions.crypt(new_code,extensions.gen_salt('bf',10)),is_initial=false,updated_at=now() where member_key=own_key;
 delete from group_private.member_login_attempts where bucket=encode(extensions.digest('account:'||own_key,'sha256'),'hex');
 return true;
end $$;
create or replace function public.change_my_login_code(p_current_code text,p_new_code text) returns boolean
language sql security invoker set search_path='' as $$select group_private.change_my_login_code(p_current_code,p_new_code)$$;
revoke all on function public.change_my_login_code(text,text),group_private.change_my_login_code(text,text) from public,anon,authenticated;
grant execute on function public.change_my_login_code(text,text),group_private.change_my_login_code(text,text) to authenticated;

create or replace function group_private.issue_member_login_code(p_member_key text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own_key text; target_key text; new_code text;
begin
 if auth.uid() is null or not public.is_group_member() then raise exception 'Anmeldung erforderlich'; end if;
 select roster_key into own_key from public.trip_attendance where user_id=auth.uid();
 target_key:=coalesce(p_member_key,own_key);
 if target_key is distinct from own_key and not group_private.is_admin() then raise exception 'Nur eigene Anmeldecodes dürfen geändert werden'; end if;
 perform 1 from public.trip_attendance t join public.group_members m on m.user_id=t.user_id where t.roster_key=target_key for update of t;
 if not found then raise exception 'Mitglied nicht gefunden'; end if;
 new_code:=encode(extensions.gen_random_bytes(16),'hex');
 insert into group_private.member_login_secrets(member_key,secret_hash,is_initial)
 values(target_key,extensions.crypt(new_code,extensions.gen_salt('bf',10)),false)
 on conflict(member_key) do update set secret_hash=excluded.secret_hash,is_initial=false,updated_at=now();
 return jsonb_build_object('code',new_code);
end $$;

-- Only the authenticated server function may resolve private email aliases or
-- exchange a valid code for an existing confirmed-email identity.
create or replace function group_private.login_with_member_code(p_name text,p_code text,p_requester uuid,p_client_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_login text:=lower(regexp_replace(btrim(coalesce(p_name,'')),'[[:space:]]+',' ','g'));
 v_candidates integer; v_target uuid; v_name text; v_key text; v_hash text; v_email text;
 v_confirmed boolean; v_bucket text; v_buckets text[]; v_failures integer; v_vote record;
 v_error jsonb:=jsonb_build_object('ok',false,'error','Name, Nickname, E-Mail oder Code ist nicht richtig.');
begin
 if p_requester is null or not exists(select 1 from auth.users where id=p_requester) then return v_error; end if;
 if char_length(v_login) not between 2 and 254 or p_code is null or octet_length(p_code)>72 then return v_error; end if;
 select count(distinct m.user_id),(array_agg(distinct m.user_id))[1]
 into v_candidates,v_target from public.group_members m
 join auth.users u on u.id=m.user_id
 left join public.member_profiles profile on profile.user_id=m.user_id
 left join public.trip_attendance t on t.user_id=m.user_id
 left join public.group_people person on person.member_key=t.roster_key
 where lower(regexp_replace(btrim(m.display_name),'[[:space:]]+',' ','g'))=v_login
 or lower(regexp_replace(btrim(profile.full_name),'[[:space:]]+',' ','g'))=v_login
 or lower(regexp_replace(btrim(person.full_name),'[[:space:]]+',' ','g'))=v_login
 or (position('@' in v_login)>1 and (lower(btrim(profile.email))=v_login
 or (u.email_confirmed_at is not null and lower(btrim(u.email))=v_login)));
 if v_candidates=1 then
  select m.display_name,t.roster_key,s.secret_hash,u.email,u.email_confirmed_at is not null
  into v_name,v_key,v_hash,v_email,v_confirmed from public.group_members m
  join auth.users u on u.id=m.user_id join public.trip_attendance t on t.user_id=m.user_id
  left join group_private.member_login_secrets s on s.member_key=t.roster_key where m.user_id=v_target;
 end if;
 v_buckets:=array[encode(extensions.digest('account:'||coalesce(v_key,v_login),'sha256'),'hex'),
 encode(extensions.digest('network:'||coalesce(p_client_key,p_requester::text),'sha256'),'hex')];
 -- Lock in a deterministic order so concurrent guesses cannot skip the limit.
 for v_bucket in select unnest(v_buckets) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(v_bucket,0));
  select failures into v_failures from group_private.member_login_attempts where bucket=v_bucket and last_failure>now()-interval '15 minutes';
  if coalesce(v_failures,0)>=(case when v_bucket=v_buckets[1] then 8 else 40 end) then
   return jsonb_build_object('ok',false,'error','Zu viele fehlgeschlagene Versuche. Bitte in 15 Minuten erneut versuchen.','limited',true);
  end if;
 end loop;
 if v_hash is null or v_candidates<>1 or extensions.crypt(btrim(p_code),v_hash) is distinct from v_hash then
  foreach v_bucket in array v_buckets loop
   insert into group_private.member_login_attempts(bucket,failures) values(v_bucket,1)
   on conflict(bucket) do update set failures=case when member_login_attempts.last_failure>now()-interval '15 minutes' then member_login_attempts.failures+1 else 1 end,last_failure=now();
  end loop;
  delete from group_private.member_login_attempts where last_failure<now()-interval '1 day';
  return v_error;
 end if;
 if exists(select 1 from public.group_members where user_id=p_requester and user_id<>v_target) then
  return jsonb_build_object('ok',false,'error','Auf diesem Gerät ist bereits ein anderes Mitglied angemeldet.');
 end if;
 perform pg_advisory_xact_lock(hashtext(lower(v_name)));
 perform 1 from public.group_members where user_id=v_target and display_name=v_name for update;
 if not found then return jsonb_build_object('ok',false,'error','Die Anmeldung wurde gerade aktualisiert. Bitte erneut versuchen.'); end if;
 delete from group_private.member_login_attempts where bucket=v_buckets[1];
 if v_confirmed then
  -- Never move this member to an anonymous user: Edge Auth issues a real session.
  return jsonb_build_object('ok',true,'mode','email','user_id',v_target,'email',v_email);
 end if;
 if exists(select 1 from group_private.admins where member_key=v_key) then return v_error; end if;
 if v_target<>p_requester then
  for v_vote in select activity_id,choice,updated_at from public.votes where user_id=v_target loop
   insert into public.vote_recovery_archive(source_user_id,activity_id,choice,updated_at,recovered_to)
   values(v_target,v_vote.activity_id,v_vote.choice,v_vote.updated_at,p_requester) on conflict do nothing;
   insert into public.votes(user_id,activity_id,choice,updated_at) values(p_requester,v_vote.activity_id,v_vote.choice,v_vote.updated_at)
   on conflict(user_id,activity_id) do update set
    choice=case when excluded.updated_at>public.votes.updated_at then excluded.choice else public.votes.choice end,
    updated_at=greatest(public.votes.updated_at,excluded.updated_at);
  end loop;
  insert into public.member_profiles(user_id,full_name,email,updated_at)
  select p_requester,full_name,email,updated_at from public.member_profiles where user_id=v_target
  on conflict(user_id) do update set full_name=excluded.full_name,email=excluded.email,updated_at=excluded.updated_at
  where excluded.updated_at>public.member_profiles.updated_at;
  delete from public.votes where user_id=v_target;
  delete from public.group_members where user_id=v_target;
  insert into public.group_members(user_id,display_name) values(p_requester,v_name);
 end if;
 return jsonb_build_object('ok',true,'mode','member');
end $$;
create or replace function public.login_with_member_code(p_name text,p_code text,p_requester uuid,p_client_key text) returns jsonb
language sql security invoker set search_path='' as $$select group_private.login_with_member_code(p_name,p_code,p_requester,p_client_key)$$;
revoke all on function public.login_with_member_code(text,text,uuid,text),group_private.login_with_member_code(text,text,uuid,text) from public,anon,authenticated;
grant usage on schema group_private to service_role;
grant execute on function public.login_with_member_code(text,text,uuid,text),group_private.login_with_member_code(text,text,uuid,text) to service_role;

-- Retired clients must reload, not bypass rate limits through the old recovery RPC.
create or replace function group_private.recover_member_secure(p_code text,p_name text) returns integer
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Bitte die Seite neu laden. Melde dich dann mit Nickname, Name oder E-Mail und deinem Code an.';
end $$;

update public.group_settings set code_hash='1e4d36177d71bbb3558e43af9577d70e' where id=1;
