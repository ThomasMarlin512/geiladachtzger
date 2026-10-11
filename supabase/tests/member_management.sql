-- All people, role assignments, names and group-code changes in this test roll back.
begin;
do $$
declare a uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); k text; p uuid; pending uuid; suffix text:=substr(gen_random_uuid()::text,1,8);
begin
 perform set_config('test.admin',a::text,true);perform set_config('test.member',m::text,true);perform set_config('test.outsider',o::text,true);perform set_config('test.fresh',f::text,true);
 perform set_config('test.admin_nick','admin-test-'||suffix,true);perform set_config('test.member_nick','member-test-'||suffix,true);perform set_config('test.changed_nick','renamed-test-'||suffix,true);
 insert into auth.users(id,role,aud,created_at,updated_at) values(a,'authenticated','authenticated',now(),now()),(m,'authenticated','authenticated',now(),now()),(o,'authenticated','authenticated',now(),now()),(f,'authenticated','authenticated',now(),now());
 update auth.users set is_anonymous=false,email=a::text||'@example.invalid',email_confirmed_at=now() where id=a;
 insert into public.group_members(user_id,display_name) values(a,current_setting('test.admin_nick')),(m,current_setting('test.member_nick'));
 select roster_key into k from public.trip_attendance where user_id=a;
 insert into group_private.admins(member_key) values(k);perform set_config('test.admin_key',k,true);
 select roster_key into k from public.trip_attendance where user_id=m;
 perform set_config('test.member_key',k,true);
 update public.group_people set full_name='Test Member Before' where member_key=k returning id into p;
 perform set_config('test.person',p::text,true);
 insert into public.member_profiles(user_id,full_name,email) values(m,'Test Member Before','private-test@example.test');
 insert into public.group_people(full_name) values('Test Pending Member') returning id into pending;perform set_config('test.pending',pending::text,true);
 insert into public.votes(user_id,activity_id,choice) values(m,'member-management-verification','yes');
 perform set_config('test.code','test-code-'||suffix,true);update public.group_settings set code_hash=md5(current_setting('test.code')) where id=1;
end $$;
set local role anon;
do $$ begin
 begin perform public.get_group_member_directory();raise exception 'Anonymous directory access allowed';exception when insufficient_privilege then null;end;
 begin perform public.update_group_member(current_setting('test.person')::uuid,'Wrong','wrong','Test Member Before',current_setting('test.member_nick'));raise exception 'Anonymous update allowed';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
do $$
declare d jsonb; own jsonb; n integer;
begin
 perform set_config('request.jwt.claim.sub',current_setting('test.outsider'),true);
 begin perform public.get_group_member_directory();raise exception 'Nonmember directory access allowed';exception when raise_exception then if sqlerrm<>'Kein Gruppenzugang' then raise;end if;end;
 begin perform public.save_kufstein_profile('Test outsider','Outsider','');raise exception 'Nonmember profile write allowed';exception when raise_exception then if sqlerrm<>'Kein Gruppenzugang' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('test.member'),true);
 d:=public.get_group_member_directory();if (d->>'can_manage')::boolean then raise exception 'Ordinary member gained admin';end if;
 if d::text like '%private-test@example.test%' or d::text like '%"email"%' or d::text like '%"user_id"%' then raise exception 'Directory exposed private data';end if;
 select count(*) into n from jsonb_array_elements(d->'members') x where (x->>'is_self')::boolean;
 if n<>1 then raise exception 'Own directory entry not unique';end if;
 begin perform public.update_group_member(current_setting('test.person')::uuid,'Wrong','wrong','Test Member Before',current_setting('test.member_nick'));raise exception 'Member can use admin endpoint';exception when raise_exception then if sqlerrm<>'Nur die Gruppenverwaltung kann andere Mitglieder bearbeiten' then raise;end if;end;
 begin update public.group_people set full_name='Forbidden';raise exception 'Direct directory write allowed';exception when insufficient_privilege then null;end;
 begin perform * from group_private.admins;raise exception 'Admin role table readable';exception when insufficient_privilege then null;end;
 own:=public.save_kufstein_profile('Test Member Own',current_setting('test.member_nick'),'private-test@example.test');
 if own->>'full_name'<>'Test Member Own' then raise exception 'Own profile not saved';end if;
 if (select full_name from public.group_people where id=current_setting('test.person')::uuid)<>'Test Member Own' then raise exception 'Own name not synchronized';end if;
 perform set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
 d:=public.get_group_member_directory();if not (d->>'can_manage')::boolean then raise exception 'Admin not recognized';end if;
 if exists(select 1 from public.member_profiles where user_id=current_setting('test.member')::uuid) then raise exception 'Admin can read private profile';end if;
 begin perform public.update_group_member(current_setting('test.person')::uuid,'Test Updated',current_setting('test.admin_nick'),'Test Member Own',current_setting('test.member_nick'));raise exception 'Duplicate nickname allowed';exception when raise_exception then if sqlerrm<>'Name ist bereits vergeben' then raise;end if;end;
 begin perform public.update_group_member(current_setting('test.person')::uuid,'Test Updated',current_setting('test.changed_nick'),'Test Member Before',current_setting('test.member_nick'));raise exception 'Stale edit accepted';exception when raise_exception then if sqlerrm<>'Die Daten wurden inzwischen geändert. Bitte die Liste neu laden' then raise;end if;end;
 perform public.update_group_member(current_setting('test.person')::uuid,'Test Member Updated',current_setting('test.changed_nick'),'Test Member Own',current_setting('test.member_nick'));
 if (select nickname from public.trip_attendance where roster_key=current_setting('test.member_key'))<>current_setting('test.changed_nick') then raise exception 'Nickname not synchronized';end if;
 perform public.update_group_member(current_setting('test.pending')::uuid,'Test Pending Updated','','Test Pending Member','');
 begin perform public.update_group_member(current_setting('test.pending')::uuid,'Test Pending Updated','Assigned nickname','Test Pending Updated','');raise exception 'Pending member nickname accepted';exception when raise_exception then if sqlerrm<>'Den Nickname legt das Mitglied bei der Anmeldung fest' then raise;end if;end;
 -- Admin identity cannot be moved with a shared or personal code.
 perform set_config('request.jwt.claim.sub',current_setting('test.fresh'),true);
 begin
  perform public.recover_kufstein_member(current_setting('test.code'),current_setting('test.admin_nick'));
  raise exception 'Admin code recovery allowed';
 exception when raise_exception then if sqlerrm not like 'Bitte mit deiner bestätigten E-Mail%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',current_setting('test.member'),true);
 own:=public.get_my_kufstein_profile();
 if own->>'email'<>'private-test@example.test' or own->>'full_name'<>'Test Member Updated' then raise exception 'Private email changed or public name not synchronized';end if;
 if (select choice from public.votes where user_id=auth.uid() and activity_id='member-management-verification')<>'yes' then raise exception 'Vote lost';end if;
 if (select roster_key from public.trip_attendance where user_id=auth.uid())<>current_setting('test.member_key') then raise exception 'Stable identity changed';end if;
end $$;
reset role;
rollback;
select 'PASS: member directory and private email isolation; own-profile sync; admin-only names, uniqueness and stale-edit checks; pending members; admin code recovery rejected; preserved votes and roster identity. All fixtures rolled back.' as result;
