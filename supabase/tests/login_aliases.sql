begin;
do $$
declare old_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); fresh_id uuid:=gen_random_uuid(); suffix text:=substr(gen_random_uuid()::text,1,8); old_key text; item_id uuid; event_key text; full_name text; profile_name text;
begin
 perform set_config('test.login_old',old_id::text,true);perform set_config('test.login_other',other_id::text,true);perform set_config('test.login_fresh',fresh_id::text,true);
 perform set_config('test.login_nick','login-nick-'||suffix,true);
 full_name:='Login Verification Full Name Longer Than Fifty Characters '||suffix;
 profile_name:='Login Profile Alias '||suffix;
 perform set_config('test.login_full',full_name,true);perform set_config('test.login_profile',profile_name,true);
 -- Personal codes are issued through the authenticated endpoint below.
 insert into auth.users(id,role,aud,created_at,updated_at) values(old_id,'authenticated','authenticated',now(),now()),(other_id,'authenticated','authenticated',now(),now()),(fresh_id,'authenticated','authenticated',now(),now());
 insert into public.group_members(user_id,display_name) values(old_id,current_setting('test.login_nick')),(other_id,'login-other-'||suffix);
 select roster_key into old_key from public.trip_attendance where user_id=old_id;
 perform set_config('test.login_key',old_key,true);
 update public.group_people p set full_name=current_setting('test.login_full') where member_key=old_key;
 insert into public.member_profiles(user_id,full_name,email) values(old_id,profile_name,'test@example.test');
 insert into public.votes(user_id,activity_id,choice) values(old_id,'login-verification','yes');
 event_key:='login-test-'||suffix;perform set_config('test.login_event',event_key,true);
 insert into public.group_events(id,title,created_by_key) values(event_key,'Temporary login verification',old_key);
 insert into public.group_event_attendance(event_id,member_key,status) values(event_key,old_key,'yes');
 insert into public.group_program_items(event_id,title,created_by_key) values(event_key,'Temporary idea',old_key) returning id into item_id;
 insert into public.group_program_votes(item_id,member_key,choice) values(item_id,old_key,'yes');
 perform set_config('test.login_item',item_id::text,true);
 perform set_config('request.jwt.claim.sub',old_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',old_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
 perform set_config('test.login_code',public.issue_member_login_code(null)->>'code',true);
 perform public.recover_kufstein_member(current_setting('test.login_code'),upper(current_setting('test.login_nick')));
 perform public.recover_kufstein_member(current_setting('test.login_code'),'  '||replace(lower(current_setting('test.login_full')),' ','   ')||'  ');
 perform public.recover_kufstein_member(current_setting('test.login_code'),current_setting('test.login_profile'));
 if (select display_name from public.group_members where user_id=auth.uid())<>current_setting('test.login_nick') then raise exception 'Full name changed the nickname';end if;
 begin
  perform public.recover_kufstein_member('wrong-test-code',current_setting('test.login_full'));
  raise exception 'Wrong personal code accepted';
 exception when raise_exception then if sqlerrm not like 'Name oder persönlicher Anmeldecode%' then raise;end if;end;
 begin
  perform public.recover_kufstein_member(current_setting('test.login_code'),'unknown-test-person');
  raise exception 'Unknown name accepted';
 exception when raise_exception then if sqlerrm not like 'Name oder persönlicher Anmeldecode%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('test.login_other'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.login_other'),'role','authenticated')::text,true);
 begin
  perform public.recover_kufstein_member(current_setting('test.login_code'),current_setting('test.login_full'));
  raise exception 'Existing different account accepted';
 exception when raise_exception then if sqlerrm<>'Dieses Konto gehört bereits zu einem anderen Teilnehmer' then raise;end if;end;
end $$;
reset role;
update public.group_people set full_name=current_setting('test.login_full') where member_key=(select roster_key from public.trip_attendance where user_id=current_setting('test.login_other')::uuid);
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub',current_setting('test.login_fresh'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.login_fresh'),'role','authenticated')::text,true);
 begin
  perform public.recover_kufstein_member(current_setting('test.login_code'),current_setting('test.login_full'));
  raise exception 'Ambiguous full name accepted';
 exception when raise_exception then if sqlerrm not like 'Name oder persönlicher Anmeldecode%' then raise;end if;end;
 -- The unique nickname still identifies the original member.
 perform public.recover_kufstein_member(current_setting('test.login_code'),current_setting('test.login_nick'));
 if (select display_name from public.group_members where user_id=auth.uid())<>current_setting('test.login_nick') then raise exception 'Recovery did not preserve nickname';end if;
 if exists(select 1 from public.group_members where user_id=current_setting('test.login_old')::uuid) then raise exception 'Duplicate membership remains';end if;
 if (select roster_key from public.trip_attendance where user_id=auth.uid())<>current_setting('test.login_key') then raise exception 'Stable roster identity changed';end if;
 if (select choice from public.votes where user_id=auth.uid() and activity_id='login-verification')<>'yes' then raise exception 'Kufstein vote lost';end if;
 if (select choice from public.group_program_votes where item_id=current_setting('test.login_item')::uuid and member_key=current_setting('test.login_key'))<>'yes' then raise exception 'Program vote lost';end if;
 if (select created_by_key from public.group_events where id=current_setting('test.login_event'))<>current_setting('test.login_key') then raise exception 'Organizer identity lost';end if;
 if (select full_name from public.member_profiles where user_id=auth.uid())<>current_setting('test.login_profile') then raise exception 'Private profile lost';end if;
 -- A second fresh device can resolve the private profile name too.
 perform set_config('request.jwt.claim.sub',current_setting('test.login_old'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.login_old'),'role','authenticated')::text,true);
 perform public.recover_kufstein_member(current_setting('test.login_code'),current_setting('test.login_profile'));
 if (select roster_key from public.trip_attendance where user_id=auth.uid())<>current_setting('test.login_key') then raise exception 'Full-name device recovery changed identity';end if;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 begin
  perform public.recover_kufstein_member(current_setting('test.login_code'),current_setting('test.login_nick'));
  raise exception 'Missing session accepted';
 exception when raise_exception then if sqlerrm<>'Anmeldung erforderlich' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: nickname, roster and private-profile full names; case and whitespace normalization; long names; preserved nickname, votes and organizer identity across devices; wrong code, unknown/ambiguous names and cross-account login rejected. All fixtures rolled back.' as result;
