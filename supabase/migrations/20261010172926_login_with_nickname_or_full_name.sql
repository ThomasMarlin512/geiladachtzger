CREATE OR REPLACE FUNCTION public.recover_kufstein_member(p_code text, p_name text)
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
 if not exists(select 1 from public.group_settings where id=1 and code_hash=md5(p_code)) then
   raise exception 'Ungültiger Gruppencode';
 end if;

 -- Resolve aliases only after validating the unchanged group-code requirement.
 -- Never publish profile data or replace the stored nickname with the login input.
 select count(distinct m.user_id), min(m.display_name), (array_agg(distinct m.user_id))[1]
 into v_candidates,v_name,v_target
 from public.group_members m
 left join public.member_profiles profile on profile.user_id=m.user_id
 left join public.trip_attendance attendance on attendance.user_id=m.user_id
 left join public.group_people person on person.member_key=attendance.roster_key
 where lower(regexp_replace(btrim(m.display_name), '[[:space:]]+', ' ', 'g'))=v_login
    or lower(regexp_replace(btrim(profile.full_name), '[[:space:]]+', ' ', 'g'))=v_login
    or lower(regexp_replace(btrim(person.full_name), '[[:space:]]+', ' ', 'g'))=v_login;
 if v_candidates=0 then raise exception 'Teilnehmer nicht gefunden. Bitte Nickname oder hinterlegten vollständigen Namen prüfen.'; end if;
 if v_candidates<>1 then raise exception 'Name nicht eindeutig. Bitte deinen eindeutigen Nickname verwenden.'; end if;
 perform pg_advisory_xact_lock(hashtext(lower(v_name)));
 -- Full name and nickname serialize on the same canonical account.
 perform 1 from public.group_members where user_id=v_target and display_name=v_name for update;
 if not found then raise exception 'Die Anmeldung wurde zwischenzeitlich geändert. Bitte erneut versuchen.'; end if;
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
end; $function$

